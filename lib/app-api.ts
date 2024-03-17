import { Aws } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from "../shared/utils";
import {reviews} from "../seed/reviews";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";


type AppApiProps = {
  userPoolId: string;
  userPoolClientId: string;
};

export class AppApi extends Construct {
  constructor(scope: Construct, id: string, props: AppApiProps) {
    super(scope, id);

    //Dynamo table

    const moviesTable = new dynamodb.Table(this, "MoviesTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "Id", type: dynamodb.AttributeType.NUMBER },
      sortKey: {name: "ReviewerName", type: dynamodb.AttributeType.STRING},
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Movies",
    });

    moviesTable.addLocalSecondaryIndex({
      indexName: "RevName",
      sortKey: { name: "ReviewerName", type: dynamodb.AttributeType.STRING },
    });

    new custom.AwsCustomResource(this, "moviesddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [moviesTable.tableName]: generateBatch(reviews),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("moviesddbInitData"), //.of(Date.now().toString()),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [moviesTable.tableArn],
      }),
    });

    const appApi = new apig.RestApi(this, "AppApi", {
      description: "App RestApi",
      endpointTypes: [apig.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apig.Cors.ALL_ORIGINS,
      },
    });

    const appCommonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "handler",
      environment: {
        TABLE_NAME: moviesTable.tableName,
        USER_POOL_ID: props.userPoolId,
        CLIENT_ID: props.userPoolClientId,
        REGION: cdk.Aws.REGION,
      },
    };



    const authorizerFn = new node.NodejsFunction(this, "AuthorizerFn", {
      ...appCommonFnProps,
      entry: "./lambda/auth/authorizer.ts",
    });

    const requestAuthorizer = new apig.RequestAuthorizer(
      this,
      "RequestAuthorizer",
      {
        identitySources: [apig.IdentitySource.header("cookie")],
        handler: authorizerFn,
        resultsCacheTtl: cdk.Duration.minutes(0),
      }
    );

    //protected

    const protectedRes = appApi.root.addResource("protected");

    const publicRes = appApi.root.addResource("public");

    const addMovieReviewFn = new node.NodejsFunction(this, "AddMovieReviewFn", {
      ...appCommonFnProps,
      entry: "./lambda/addMovieReview.ts",
  });

  const updateMovieReviewFn = new node.NodejsFunction(this, "UpdateMovieReviewFn", {
      ...appCommonFnProps,
      entry: "./lambda/updateReview.ts",
  });

  moviesTable.grantReadWriteData(addMovieReviewFn);
  moviesTable.grantReadWriteData(updateMovieReviewFn);


  protectedRes.addMethod("POST", new apig.LambdaIntegration(addMovieReviewFn), {
    authorizer: requestAuthorizer,
    authorizationType: apig.AuthorizationType.CUSTOM,
});

protectedRes.addMethod("PUT", new apig.LambdaIntegration(updateMovieReviewFn), {
    authorizer: requestAuthorizer,
    authorizationType: apig.AuthorizationType.CUSTOM,
});



//public




 


 



  }


}