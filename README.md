# Serverless Framework Node Express API on AWS

Deploys a simple Node Express API service, backed by DynamoDB database, running on AWS Lambda using the traditional Serverless Framework.


## Anatomy of the template

This template configures a single-function api, `api`, which is responsible for handling all incoming requests thanks to the `httpApi` event. To learn more about `httpApi` event configuration options, please refer to [httpApi event docs](https://www.serverless.com/framework/docs/providers/aws/events/http-api/). As the event is configured in a way to accept all incoming requests, `express` framework is responsible for routing and handling requests internally. Implementation takes advantage of `serverless-http` package, which allows you to wrap existing `express` applications. To learn more about `serverless-http`, please refer to corresponding [GitHub repository](https://github.com/dougmoscrop/serverless-http). Additionally, it also handles provisioning of a DynamoDB database that is used for storing data about users. The `express` application exposes two endpoints, `POST /users` and `GET /user/{userId}`, which allow to create and retrieve users.

## Usage

### Deployment

Install dependencies with:

```
npm install
```

and then deploy with:

```
serverless deploy
```

After running deploy, you should see output similar to:

```bash
Deploying aws-node-express-dynamodb-api-project to stage dev (us-east-1)

✔ Service deployed to stack aws-node-express-dynamodb-api-project-dev (196s)

endpoint: ANY - https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
functions:
  api: aws-node-express-dynamodb-api-project-dev-api (766 kB)
```

_Note_: In current form, after deployment, your API is public and can be invoked by anyone. For production deployments, you might want to configure an authorizer. For details on how to do that, refer to [`httpApi` event docs](https://www.serverless.com/framework/docs/providers/aws/events/http-api/). Additionally, in current configuration, the DynamoDB table will be removed when running `serverless remove`. To retain the DynamoDB table even after removal of the stack, add `DeletionPolicy: Retain` to its resource definition.

### Invocation

After successful deployment, you can create a new user by calling the corresponding endpoint:

```bash
curl --location --request POST 'http://localhost:3000/events' \
--header 'Content-Type: application/json' \
--data-raw '{"name": "webhook-test-metadata-auth", "type": "timesheet", "foo": "bar"}'
```

This example will create a "timesheet" action and should result in the following response:

```bash
{
    "uuid": "0fd4a303-a70b-43da-b0da-5e601424589c",
    "authString": "9313405d-a2cb-4ee6-b6fd-037604bd4742",
    "type": "timesheet",
    "name": "webhook-test",
    "url": "https://localhost:3000/events/0fd4a303-a70b-43da-b0da-5e601424589c?auth=9313405d-a2cb-4ee6-b6fd-037604bd4742"
}
```

The webhook  by calling the following endpoint:

```bash
curl --location --request POST 'http://localhost:3000/events/0fd4a303-a70b-43da-b0da-5e601424589c?auth=9313405d-a2cb-4ee6-b6fd-037604bd4742' \
--header 'Content-Type: application/json' \
--data-raw '{"date": "2020-02-10", "hours": "10", "message": ""}'
```

For now this should respond with the message this endpoint intends to dispatch:

```bash
{
    "name": "webhook-test",
    "type": "webhook",
    "source": "0fd4a303-a70b-43da-b0da-5e601424589c",
    "actions": [
        {
            "type": "timesheet",
            "source": "0fd4a303-a70b-43da-b0da-5e601424589c",
            "payload": {
                "date": "2020-02-10",
                "hours": "10",
                "message": ""
            },
            "metadata": {
                "foo": "bar"
            }
        }
    ]
}
```

Errors are handled but in prod this endpoint would return a blank 200 regardless of data to mitigate brute-forcing.

Messages will be queued by SQS or EventBridge and filtered to handlers based on uuid 

API handles and transforms XML & JSON however payload should be dispatched as a buffer this should be handled mid-workflow by a lambda

### Local development

It is also possible to emulate DynamoDB, API Gateway and Lambda locally using the `serverless-dynamodb-local` and `serverless-offline` plugins. In order to do that, run:

```bash
serverless plugin install -n serverless-dynamodb-local
serverless plugin install -n serverless-offline
```

It will add both plugins to `devDependencies` in `package.json` file as well as will add it to `plugins` in `serverless.yml`. Make sure that `serverless-offline` is listed as last plugin in `plugins` section:

```
plugins:
  - serverless-dynamodb-local
  - serverless-offline
```

You should also add the following config to `custom` section in `serverless.yml`:

```
custom:
  (...)
  dynamodb:
    start:
      migrate: true
    stages:
      - dev
```

Additionally, we need to reconfigure `AWS.DynamoDB.DocumentClient` to connect to our local instance of DynamoDB. We can take advantage of `IS_OFFLINE` environment variable set by `serverless-offline` plugin and replace:

```javascript
const dynamoDbClient = new AWS.DynamoDB.DocumentClient();
```

with the following:

```javascript
const dynamoDbClientParams = {};
if (process.env.IS_OFFLINE) {
  dynamoDbClientParams.region = 'localhost'
  dynamoDbClientParams.endpoint = 'http://localhost:8000'
}
const dynamoDbClient = new AWS.DynamoDB.DocumentClient(dynamoDbClientParams);
```

After that, running the following command with start both local API Gateway emulator as well as local instance of emulated DynamoDB:

```bash
serverless offline start
```

To learn more about the capabilities of `serverless-offline` and `serverless-dynamodb-local`, please refer to their corresponding GitHub repositories:
- https://github.com/dherault/serverless-offline
- https://github.com/99x/serverless-dynamodb-local
