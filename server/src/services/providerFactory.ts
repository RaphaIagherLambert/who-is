import { AwsRekognitionProvider } from "./rekognition.js";
import { MockRecognitionProvider } from "./mockRecognition.js";
import type { RecognitionProvider } from "./types.js";

export function createRecognitionProvider(): RecognitionProvider {
  const provider = process.env.RECOGNITION_PROVIDER ?? "mock";

  if (provider === "aws") {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error(
        "AWS credentials required when RECOGNITION_PROVIDER=aws. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY."
      );
    }
    return new AwsRekognitionProvider();
  }

  return new MockRecognitionProvider();
}
