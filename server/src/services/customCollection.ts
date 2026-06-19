import {
  CreateCollectionCommand,
  DescribeCollectionCommand,
  IndexFacesCommand,
  RekognitionClient,
  ResourceAlreadyExistsException,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { isTeachingsEnabled } from "./teachingsStore.js";

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

function getCollectionId(): string {
  return process.env.REKOGNITION_COLLECTION_ID ?? "who-is-faces";
}

function getMinSimilarity(): number {
  return Number(process.env.MIN_FACE_SIMILARITY) || 95;
}

export function isCustomCollectionEnabled(): boolean {
  return (
    isTeachingsEnabled() &&
    (process.env.RECOGNITION_PROVIDER ?? "mock") === "aws"
  );
}

export async function ensureCustomCollection(): Promise<boolean> {
  if (!isCustomCollectionEnabled()) return false;
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

export async function indexTeachingFace(
  imageBase64: string,
  externalId: string
): Promise<string | null> {
  if (!(await ensureCustomCollection())) return null;

  const imageBytes = Buffer.from(imageBase64, "base64");
  const response = await getClient().send(
    new IndexFacesCommand({
      CollectionId: getCollectionId(),
      Image: { Bytes: imageBytes },
      ExternalImageId: externalId,
      MaxFaces: 1,
      QualityFilter: "AUTO",
    })
  );

  const faceId = response.FaceRecords?.[0]?.Face?.FaceId;
  return faceId ?? null;
}

export interface CustomFaceMatch {
  externalId: string;
  similarity: number;
  faceId?: string;
}

export async function searchTeachingFace(
  imageBase64: string
): Promise<CustomFaceMatch | null> {
  if (!(await ensureCustomCollection())) return null;

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

export function getCustomCollectionStatus() {
  return {
    enabled: isCustomCollectionEnabled(),
    ready: collectionReady,
    collectionId: getCollectionId(),
    minSimilarity: getMinSimilarity(),
  };
}
