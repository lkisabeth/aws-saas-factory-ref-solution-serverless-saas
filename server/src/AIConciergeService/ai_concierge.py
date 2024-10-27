import json
import boto3
from openai import OpenAI
import logger
from botocore.exceptions import ClientError
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools import Tracer
from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging import correlation_paths

tracer = Tracer()
logger = Logger()
cors_config = CORSConfig(allow_origin="*", max_age=300)
app = APIGatewayRestResolver(cors=cors_config)

@app.post("/ai-concierge")
@tracer.capture_method
def handle_message():
    try:

        openai_api_key = get_openai_api_key()
        client = OpenAI(api_key=openai_api_key)

        body = app.current_event.json_body
        thread_id = body.get('threadId')
        
        if not thread_id:
            # Create new thread for new conversations
            thread = client.beta.threads.create()
            thread_id = thread.id
        
        assistant = create_assistant(client)
        
        # Add user message to thread
        user_message = body.get('message')
        client.beta.threads.messages.create(
            thread_id=thread_id,
            role="user",
            content=user_message
        )
        
        assistant_message = get_assistant_response(
            client, 
            thread_id, 
            assistant.id
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': assistant_message.content[0].text.value,
                'threadId': thread_id
            })
        }
        
    except Exception as e:
        logger.error(f"Error in handle_message: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }

@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST, log_event=True)
@tracer.capture_lambda_handler
def lambda_handler(event, context):
    return app.resolve(event, context)

def get_openai_api_key():
    """Retrieve OpenAI API Key from AWS Secrets Manager"""
    secret_name = "OpenAI_API_Key"
    region_name = "us-east-2"
    
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )
    
    try:
        response = client.get_secret_value(SecretId=secret_name)
        return response['SecretString']
    except ClientError as e:
        logger.error(f"Error getting secret: {str(e)}")
        raise e

def create_assistant(client):
    """Create or retrieve OpenAI assistant"""
    # I'd like to store these assisnants and threads in a more permanent way. this is fine for now.
    return client.beta.assistants.create(
        name="SaaS Concierge",
        instructions="You are a helpful AI assistant for a SaaS application.",
        model="gpt-4-1106-preview"
    )

def get_assistant_response(client, thread_id, assistant_id):
    """Get response from OpenAI assistant"""
    run = client.beta.threads.runs.create(
        thread_id=thread_id,
        assistant_id=assistant_id
    )
    
    # Wait for completion (streaming would take a bit more time to implement)
    while run.status != 'completed':
        run = client.beta.threads.runs.retrieve(
            thread_id=thread_id, 
            run_id=run.id
        )
    
    # Get messages and return last assistant message
    messages = client.beta.threads.messages.list(thread_id=thread_id)
    return next(msg for msg in messages if msg.role == 'assistant')
