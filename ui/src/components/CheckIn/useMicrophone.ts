import { useRef, useState, useCallback, useEffect } from "react";

export type MicState = "idle" | "requesting" | "listening" | "paused" | "error";

export interface MicError {
  code: "unsupported" | "denied" | "no_device" | "disconnected" | "provider_error" | "unknown";
  message: string;
}

export interface UseMicrophoneOptions {
  onAudioChunk: (blob: Blob) => void;
  onStateChange?: (state: MicState) => void;
}

export interface AudioLevelInfo {
  level: number;
}

export function useMicrophone({ onAudioChunk, onStateChange }: UseMicrophoneOptions) {
  const [micState, setMicState] = useState<MicState>("idle");
  const [micError, setMicError] = useState<MicError | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateState = useCallback((s: MicState) => {
    setMicState(s);
    onStateChange?.(s);
  }, [onStateChange]);

  const stopLevelMonitor = useCallback(() => {
    if (levelRafRef.current !== null) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
  }, []);

  const startLevelMonitor = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = ((dataArray[i] ?? 128) - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setAudioLevel(Math.min(1, rms * 3));
        levelRafRef.current = requestAnimationFrame(tick);
      };
      levelRafRef.current = requestAnimationFrame(tick);
    } catch {
      // AudioContext not available — non-fatal
    }
  }, []);

  const stopAllTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    stopLevelMonitor();
  }, [stopLevelMonitor]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
  }, []);

  const flushChunks = useCallback(() => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "audio/webm" });
    chunksRef.current = [];
    onAudioChunk(blob);
  }, [onAudioChunk]);

  const startTimer = useCallback(() => {
    setElapsedSec(0);
    timerRef.current = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
  }, []);

  const startChunkFlush = useCallback(() => {
    chunkTimerRef.current = setInterval(() => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        try {
          recorderRef.current.requestData();
        } catch {
          // Non-fatal
        }
      }
    }, 5000);
  }, []);

  const startRecording = useCallback(async () => {
    setMicError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicError({ code: "unsupported", message: "This browser does not support microphone capture." });
      updateState("error");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setMicError({ code: "unsupported", message: "MediaRecorder is not supported in this browser." });
      updateState("error");
      return;
    }

    updateState("requesting");

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
        video: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter((d) => d.kind === "audioinput"));

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        flushChunks();
      };

      recorder.onerror = () => {
        setMicError({ code: "unknown", message: "MediaRecorder error occurred." });
        updateState("error");
      };

      recorder.start(1000);
      startLevelMonitor(stream);
      startTimer();
      startChunkFlush();
      updateState("listening");
    } catch (e: unknown) {
      const err = e as DOMException;
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        setMicError({ code: "denied", message: "Microphone permission denied. Please allow access in your browser." });
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setMicError({ code: "no_device", message: "No microphone found. Connect a microphone and try again." });
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        setMicError({ code: "disconnected", message: "Microphone is unavailable or disconnected." });
      } else {
        setMicError({ code: "unknown", message: err.message || "Failed to access microphone." });
      }
      updateState("error");
      stopAllTracks();
    }
  }, [selectedDeviceId, flushChunks, startLevelMonitor, startTimer, startChunkFlush, updateState, stopAllTracks]);

  const pauseRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.pause();
      stopTimer();
      stopLevelMonitor();
      updateState("paused");
    }
  }, [stopTimer, stopLevelMonitor, updateState]);

  const resumeRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === "paused") {
      recorderRef.current.resume();
      startTimer();
      startChunkFlush();
      startLevelMonitor(streamRef.current!);
      updateState("listening");
    }
  }, [startTimer, startChunkFlush, startLevelMonitor, updateState]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current) {
      if (recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
    }
    stopTimer();
    stopAllTracks();
    setAudioLevel(0);
    setElapsedSec(0);
    updateState("idle");
  }, [stopTimer, stopAllTracks, updateState]);

  const stopRecordingSilently = useCallback(() => {
    if (recorderRef.current) {
      try {
        if (recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      recorderRef.current = null;
    }
    stopTimer();
    stopAllTracks();
    setAudioLevel(0);
    setElapsedSec(0);
  }, [stopTimer, stopAllTracks]);

  useEffect(() => {
    return () => {
      stopRecordingSilently();
    };
  }, [stopRecordingSilently]);

  return {
    micState,
    micError,
    elapsedSec,
    audioLevel,
    inputDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    stopAllTracks,
    clearError: () => { setMicError(null); updateState("idle"); }
  };
}
