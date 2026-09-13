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
  // Slightly lower than studio-photo defaults — helps paused video / TV frames.
  return Number(process.env.MIN_FACE_SIMILARITY) || 88;
}

/** AWS ExternalImageId for the nth face of a person (1-based). */
export function faceExternalId(personId: string, faceIndex: number): string {
  return faceIndex <= 1 ? personId : `${personId}_${faceIndex}`;
}

/** Strip `_2`, `_3`, … suffixes so Q42_2 resolves to person Q42. */
export function normalizePersonExternalId(externalId: string): string {
  return externalId.replace(/_\d+$/, "");
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

/**
 * Best single collection hit (legacy helper).
 */
export async function searchFaceCollection(
  imageBase64: string
): Promise<FaceCollectionMatch | null> {
  const matches = await searchFaceCollectionMatches(imageBase64, 1);
  return matches[0] ?? null;
}

/**
 * Top unique people in the collection (by ExternalImageId person id).
 * Used as the primary recognition path as the index grows.
 */
export async function searchFaceCollectionMatches(
  imageBase64: string,
  maxPeople = 3
): Promise<FaceCollectionMatch[]> {
  if (!(await ensureFaceCollection())) return [];

  const imageBytes = Buffer.from(imageBase64, "base64");
  const minSimilarity = getMinSimilarity();
  // Fetch extra faces so multi-image people and near-ties still yield unique persons.
  const maxFaces = Math.min(25, Math.max(5, maxPeople * 5));

  const response = await getClient().send(
    new SearchFacesByImageCommand({
      CollectionId: getCollectionId(),
      Image: { Bytes: imageBytes },
      MaxFaces: maxFaces,
      FaceMatchThreshold: Math.max(70, minSimilarity - 8),
    })
  );

  const byPerson = new Map<string, FaceCollectionMatch>();

  for (const hit of response.FaceMatches ?? []) {
    const rawId = hit.Face?.ExternalImageId;
    const similarity = hit.Similarity ?? 0;
    if (!rawId || similarity < Math.max(70, minSimilarity - 8)) continue;

    const externalId = normalizePersonExternalId(rawId);
    const prev = byPerson.get(externalId);
    if (!prev || similarity > prev.similarity) {
      byPerson.set(externalId, {
        externalId,
        similarity,
        faceId: hit.Face?.FaceId,
      });
    }
  }

  return [...byPerson.values()]
    .filter((m) => m.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxPeople);
}

export function getFaceCollectionStatus() {
  return {
    enabled: isFaceCollectionEnabled(),
    ready: collectionReady,
    collectionId: getCollectionId(),
    minSimilarity: getMinSimilarity(),
  };
}
