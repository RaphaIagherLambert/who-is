import type { CelebrityMatch, RecognitionProvider } from "./types.js";

/**
 * Demo provider for development without AWS credentials.
 * Uses simple image brightness/contrast heuristics to simulate detection
 * and returns a rotating set of well-known public figures for UI testing.
 */
export class MockRecognitionProvider implements RecognitionProvider {
  private callCount = 0;

  private readonly demoCelebrities = [
    "Barack Obama",
    "Taylor Swift",
    "Leonardo DiCaprio",
    "Beyoncé",
    "Cristiano Ronaldo",
    "Elon Musk",
  ];

  async recognize(imageBase64: string): Promise<CelebrityMatch[]> {
    const bytes = Buffer.from(imageBase64, "base64");
    if (bytes.length < 1000) {
      return [];
    }

    // Simulate processing delay
    await new Promise((r) => setTimeout(r, 400));

    const hasContent = bytes.some((b, i) => i % 50 === 0 && b > 30 && b < 220);
    if (!hasContent) {
      return [];
    }

    this.callCount++;
    const name =
      this.demoCelebrities[this.callCount % this.demoCelebrities.length];

    return [
      {
        name,
        confidence: 92.5,
        boundingBox: { left: 0.25, top: 0.15, width: 0.5, height: 0.65 },
      },
    ];
  }
}
