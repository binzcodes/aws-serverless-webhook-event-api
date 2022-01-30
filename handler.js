const AWS = require("aws-sdk");
const express = require("express");
const serverless = require("serverless-http");

const app = express();

const USERS_TABLE = process.env.USERS_TABLE;

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

app.use(express.json());

app.get("/users/:userId", async function (req, res) {
  const params = {
    TableName: USERS_TABLE,
    Key: {
      userId: req.params.userId,
    },
  };

  try {
    const {Item} = await dynamoDbClient.get(params).promise();
    if (Item) {
      const {userId, name} = Item;
      return res.json({userId, name});
    }
    return res
      .status(404)
      .json({error: 'Could not find user with provided "userId"'});
  } catch (error) {
    console.log(error);
    return res.status(500).json({error: "Failed to retrieve user"});
  }
});

app.post("/users", async function (req, res) {
  const {userId, name} = req.body;
  if (typeof userId !== "string") {
    return res.status(400).json({error: '"userId" must be a string'});
  }
  if (typeof name !== "string") {
    return res.status(400).json({error: '"name" must be a string'});
  }

  const params = {
    TableName: USERS_TABLE,
    Item: {
      userId: userId,
      name: name,
    },
  };

  try {
    await dynamoDbClient.put(params).promise();
    return res.json({userId, name});
  } catch (error) {
    console.log(error);
    return res.status(500).json({error: "Could not create user"});
  }
});

app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});

module.exports.handler = serverless(app);
