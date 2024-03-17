import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import Ajv from "ajv";
import schema from "../shared/types.schema.json" ;

const ajv = new Ajv();
const isValidBodyParams = ajv.compile(schema.definitions["UpdateReview"] || {});

const dynamoDbDocClient = createDynamoDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try {
        console.log("Event: ", event);
        const parameters = event?.pathParameters;
        const Id = parameters?.Id ? parseInt(parameters.Id) : undefined;
        const reviewerName = parameters?.reviewerName;
        const body = event.body ? JSON.parse(event.body) : undefined;


        if (!Id || !reviewerName) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "Missing details for request." }),
            };
        }

        if (!body) {
            return {
                statusCode: 500,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ message: "Missing request body." }),
            };
        }

        if (!isValidBodyParams(body)) {
            return {
                statusCode: 500,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    message: `Incorrect type`,
                    schema: schema.definitions["UpdateReview"],
                }),
            };
        }

        const updateResult = await dynamoDbDocClient.send(
            new UpdateCommand({
                TableName: process.env.TABLE_NAME,
                Key: {
                    Id: Id,
                    ReviewerName: reviewerName,
                },
                UpdateExpression: "set Content = :reviewText",
                ExpressionAttributeValues: {
                    ":reviewText": body.Content,
                },
                ReturnValues: "UPDATED_NEW",
            })
        );

        return {
            statusCode: 200,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ message: "Update Successful", data: updateResult}),
        };

    } catch (error: any) {
        console.log(JSON.stringify(error));
        return {
            statusCode: 500,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ error }),
        };
    }
};

function createDynamoDbDocClient() {
    const ddbClient = new DynamoDBClient({ region: process.env.REGION });
    const marshallOptions = {
        convertEmptyValues: true,
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
    };
    const unmarshallOptions = {
        wrapNumbers: false,
    };
    const translateConfig = { marshallOptions, unmarshallOptions };
    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}