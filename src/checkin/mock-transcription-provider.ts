import type {
  TranscriptionProvider,
  TranscriptionProviderHealth,
  TranscribeChunkInput,
  TranscribeChunkResult,
  FinalizeSessionInput,
  FinalizeSessionResult
} from "./transcription-provider.js";
import type { TranscriptSegment } from "./checkin-contract.js";

const MOCK_SEGMENTS = [
  "Hi, I'm bringing in my MacBook Pro for repair.",
  "My name is Sarah Johnson, my phone number is 555-123-4567.",
  "The laptop won't turn on, it just stopped working two days ago.",
  "I'm not sure if there was any water damage, maybe a little spill last week.",
  "I don't have it backed up, and I really need the data.",
  "I brought the charger but not the case.",
  "The serial number is C02XYZ123456.",
  "I think it's a 2021 model, space gray color.",
  "Can you check if it's still under Apple warranty?",
  "I'll enter the passcode myself when needed."
];

export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock-transcription";
  readonly isLocal = true;
  readonly isCloud = false;
  private segmentCounter = 0;
  private currentSessionSegments: TranscriptSegment[] = [];

  async getHealth(): Promise<TranscriptionProviderHealth> {
    return {
      status: "available",
      providerName: this.name,
      endpoint: "mock://transcription",
      isLocal: true,
      isCloud: false
    };
  }

  async transcribeChunk(input: TranscribeChunkInput): Promise<TranscribeChunkResult> {
    const segmentId = `mock-seg-${this.segmentCounter++}`;
    const text = MOCK_SEGMENTS[this.segmentCounter % MOCK_SEGMENTS.length] ?? "";
    const baseTime = input.sessionStartTimeMs + this.segmentCounter * 3000;
    const segment: TranscriptSegment = {
      segmentId,
      text,
      startTimeMs: baseTime,
      endTimeMs: baseTime + 2500,
      confidence: 0.95,
      speakerRole: input.speakerRole ?? "customer",
      provider: this.name,
      status: "final"
    };
    this.currentSessionSegments.push(segment);
    return { segments: [segment], providerName: this.name };
  }

  async finalizeSession(_input: FinalizeSessionInput): Promise<FinalizeSessionResult> {
    const segments = [...this.currentSessionSegments];
    this.currentSessionSegments = [];
    this.segmentCounter = 0;
    return { segments, providerName: this.name };
  }

  reset(): void {
    this.currentSessionSegments = [];
    this.segmentCounter = 0;
  }
}
