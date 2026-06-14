export interface CelebrityMatch {
  name: string;
  confidence: number;
  boundingBox?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  /** Optional reference URLs returned by AWS Rekognition */
  urls?: string[];
}

export interface RecognitionProvider {
  recognize(imageBase64: string): Promise<CelebrityMatch[]>;
}
