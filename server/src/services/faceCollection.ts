import {
  CreateCollectionCommand,
  DescribeCollectionCommand,
  IndexFacesCommand,
  RekognitionClient,
  ResourceAlreadyExistsException,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";

let client: RekognitionClient | null = null;
let collectionReady = false;

function getClient(): RekognitionClient {
  if (!client) {
    client = new RekognitionClient({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
  }
  return client;
}

export function getCollectionId(): string {
  return process.env.REKOGNITION_COLLECTION_ID ?? "who-is-faces";
}

function getMinSimilarity(): number {
  return Number(process.env.MIN_FACE_SIMILARITY) || 95;
}

export function isFaceCollectionEnabled(): boolean {
  return (
    (process.env.RECOGNITION_PROVIDER ?? "mock") === "aws" &&
    Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
  );
}

export async function ensureFaceCollection(): Promise<boolean> {
  if (!isFaceCollectionEnabled()) return false;
  if (collectionReady) return true;

  const rekognition = getClient();
  const collectionId = getCollectionId();

  try {
    await rekognition.send(
      new DescribeCollectionCommand({ CollectionId: collectionId })
    );
    collectionReady = true;
    return true;
  } catch {
    try {
      await rekognition.send(
        new CreateCollectionCommand({ CollectionId: collectionId })
      );
      collectionReady = true;
      console.log(`Created Rekognition collection: ${collectionId}`);
      return true;
    } catch (err) {
      if (err instanceof ResourceAlreadyExistsException) {
        collectionReady = true;
        return true;
      }
      console.error("Failed to create Rekognition collection:", err);
      return false;
    }
  }
}

export async function indexFaceBytes(
  imageBytes: Buffer,
  externalId: string
): Promise<string | null> {
  if (!(await ensureFaceCollection())) return null;

  const response = await getClient().send(
    new IndexFacesCommand({
      CollectionId: getCollectionId(),
      Image: { Bytes: imageBytes },
      ExternalImageId: externalId,
      MaxFaces: 1,
      QualityFilter: "AUTO",
    })
  );

  return response.FaceRecords?.[0]?.Face?.FaceId ?? null;
}

export async function indexFaceBase64(
  imageBase64: string,
  externalId: string
): Promise<string | null> {
  return indexFaceBytes(Buffer.from(imageBase64, "base64"), externalId);
}

export interface FaceCollectionMatch {
  externalId: string;
  similarity: number;
  faceId?: string;
}

export async function searchFaceCollection(
  imageBase64: string
): Promise<FaceCollectionMatch | null> {
  if (!(await ensureFaceCollection())) return null;

  const imageBytes = Buffer.from(imageBase64, "base64");
  const minSimilarity = getMinSimilarity();

  const response = await getClient().send(
    new SearchFacesByImageCommand({
      CollectionId: getCollectionId(),
      Image: { Bytes: imageBytes },
      MaxFaces: 1,
      FaceMatchThreshold: minSimilarity,
    })
  );

  const best = response.FaceMatches?.[0];
  if (!best?.Face?.ExternalImageId || (best.Similarity ?? 0) < minSimilarity) {
    return null;
  }

  return {
    externalId: best.Face.ExternalImageId,
    similarity: best.Similarity ?? 0,
    faceId: best.Face.FaceId,
  };
}

export function getFaceCollectionStatus() {
  return {
    enabled: isFaceCollectionEnabled(),
    ready: collectionReady,
    collectionId: getCollectionId(),
    minSimilarity: getMinSimilarity(),
  };
}
