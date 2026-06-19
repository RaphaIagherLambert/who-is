import {
  RekognitionClient,
  RecognizeCelebritiesCommand,
} from "@aws-sdk/client-rekognition";
import type { CelebrityMatch, RecognitionProvider } from "./types.js";

export class AwsRekognitionProvider implements RecognitionProvider {
  private client: RekognitionClient;

  constructor() {
    this.client = new RekognitionClient({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
  }

  async recognize(imageBase64: string): Promise<CelebrityMatch[]> {
    const imageBytes = Buffer.from(imageBase64, "base64");

    const response = await this.client.send(
      new RecognizeCelebritiesCommand({
        Image: { Bytes: imageBytes },
      })
    );

    const celebrities = response.CelebrityFaces ?? [];

    return celebrities
      .filter((face) => face.Name && (face.MatchConfidence ?? 0) > 0)
      .map((face) => ({
        name: face.Name!,
        confidence: face.MatchConfidence ?? 0,
        boundingBox: face.Face?.BoundingBox
          ? {
              left: face.Face.BoundingBox.Left ?? 0,
              top: face.Face.BoundingBox.Top ?? 0,
              width: face.Face.BoundingBox.Width ?? 0,
              height: face.Face.BoundingBox.Height ?? 0,
            }
          : undefined,
        urls: face.Urls?.map(String),
        faceConfidence: face.Face?.Confidence,
        sharpness: face.Face?.Quality?.Sharpness,
        brightness: face.Face?.Quality?.Brightness,
        pose: face.Face?.Pose
          ? {
              yaw: face.Face.Pose.Yaw ?? 0,
              pitch: face.Face.Pose.Pitch ?? 0,
              roll: face.Face.Pose.Roll ?? 0,
            }
          : undefined,
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }
}
