import { marshall } from "@aws-sdk/util-dynamodb";
import { Review } from "./types";

export const generateMovieItem = (movie: Review) => {
  return {
    PutRequest: {
      Item: marshall(movie),
    },
  };
};

export const generateBatch = (data: Review[]) => {
  return data.map((e) => {
    return generateMovieItem(e);
  });
};