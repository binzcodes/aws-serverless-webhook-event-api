const AWS = require("aws-sdk");
const serverless = require("serverless-http");
const {v4: uuidV4} = require("uuid");

const express = require("express");
const bodyParser = require("body-parser");
require("body-parser-xml")(bodyParser);
const xmlParseOptions = {
  normalize: true, // Trim whitespace inside text nodes
  normalizeTags: true, // Transform tags to lowercase
  explicitArray: false, // Only put nodes in array if >1
};

const app = express();

const USERS_TABLE = process.env.USERS_TABLE;
const WEBHOOKS_TABLE = process.env.WEBHOOKS_TABLE;

const dynamoDbClientParams = {};

if (process.env.IS_OFFLINE) {
  AWS.config.update({
    region: "localhost",
    accessKeyId: "accessKeyId",
    secretAccessKey: "secretAccessKey",
    endpoint: new AWS.Endpoint("http://localhost:8000"),
  });

  dynamoDbClientParams.region = "localhost";
  dynamoDbClientParams.endpoint = "http://localhost:8000";
}

const dynamoDbClient = new AWS.DynamoDB.DocumentClient(dynamoDbClientParams);

// * definitely belongs in handler or mid-workflow
// ? sending body as a buffer with content-type likely preferred
app.use(bodyParser.json());
app.use(bodyParser.xml({xmlParseOptions}));
app.use(bodyParser.text({type: "text/html"}));

app.post("/events/:eventId", async function (req, res) {
  const payload = req.body;
  const authParam = req.query.auth;
  console.log(authParam);
  const params = {
    TableName: WEBHOOKS_TABLE,
    Key: {
      uuid: req.params.eventId,
    },
  };

  try {
    // * option to check exists before passing to queue
    const {Item} = await dynamoDbClient.get(params).promise();
    // todo: potentially validate source/ip against db?
    if (Item) {
      const {uuid, name, type, authString, ...metadata} = Item;
      if (authParam !== authString) {
        return res
          .status(404)
          .json({
            error:
              'Could not authenticate webhook with provided "authParameter"',
          });
      }
      const message = {
        name,
        type: "webhook", // consistent from this endpoint
        source: uuid,
        actions: [{
            type: type,
            source: uuid,
            payload: payload,
            metadata,
        }],
      };

      // todo: dispatch SQS/EventBridge event
      console.log(message);
      // todo: handle dispatched event
      return res.json(message);
    }
    return res
      .status(404)
      .json({error: 'Could not find webhook with provided "uuid"'});
    // ! outside POC won't want to ID non-events, return 200 on all
  } catch (error) {
    console.log(error);
    return res.status(500).json({error: "Failed to retrieve event"});
  }
});

app.use("/events", function (req, res, next) {
  // todo: endpoint security for list and create
  console.log("Protecting:", req.method, "/events", "(not)");
  next();
});

app.get("/events", () => {
  // TODO: list events
});

// create new webhook endpoint
app.post("/events", async function (req, res) {
  const {type, name, ...metadata} = req.body;
  if (typeof type !== "string")
    return res.status(400).json({error: '"type" must be a string'});
  if (typeof name !== "string")
    return res.status(400).json({error: '"name" must be a string'});

  const uuid = uuidV4();
  const authString = uuidV4();

  const params = {
    TableName: WEBHOOKS_TABLE,
    Item: {
      uuid,
      type,
      name,
      authString,
      ...metadata,
    },
  };

  try {
    await dynamoDbClient.put(params).promise();
    const url = `${
      req.protocol + "://" + req.get("host")
    }/events/${uuid}?auth=${authString}`;
    return res.json({uuid, authString, type, name, url});
  } catch (error) {
    console.log(error);
    return res.status(500).json({error: "Could not create event"});
  }
});

app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});

// todo: catch errors

module.exports.handler = serverless(app);
