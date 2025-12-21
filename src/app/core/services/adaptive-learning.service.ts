import { Injectable } from '@angular/core';
import { AdaptiveProgress, ProgressLevel } from '../../models';

const DAY_MS = 1000 * 60 * 60 * 24;
const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 2.6;
const MAX_SAMPLES = 800;
const MIN_TRAIN_SAMPLES = 50;
const FEATURE_COUNT = 6;
const MAX_PREDICT_DAYS = 60;

interface TrainingSample {
  features: number[];
  label: number;
  timestamp: number;
}

interface AdaptiveUpdate extends AdaptiveProgress {
  quality: number;
}

type NormalizedAdaptiveProgress = AdaptiveProgress & {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: Date;
  lastQuality: number;
  difficulty: number;
};

@Injectable({
  providedIn: 'root'
})
export class AdaptiveLearningService {
  private tf: typeof import('@tensorflow/tfjs') | null = null;
  private userModels = new Map<string, import('@tensorflow/tfjs').LayersModel>();
  private userSamples = new Map<string, TrainingSample[]>();
  private trainingUsers = new Set<string>();

  computeQuality(isCorrect: boolean, responseTimeMs?: number | null): number {
    if (!isCorrect) {
      return 2;
    }

    if (responseTimeMs === undefined || responseTimeMs === null) {
      return 4;
    }

    if (responseTimeMs <= 2000) {
      return 5;
    }
    if (responseTimeMs <= 5000) {
      return 4;
    }
    if (responseTimeMs <= 9000) {
      return 3;
    }
    return 3;
  }

  normalizeProgress(
    progress: (AdaptiveProgress & { lastAttemptAt?: Date }) | null | undefined,
    now = new Date()
  ): NormalizedAdaptiveProgress {
    const safe = (progress ?? {}) as AdaptiveProgress & { lastAttemptAt?: Date };
    const intervalDays = safe.intervalDays ?? 0;
    const lastAttemptAt = safe.lastAttemptAt ?? now;
    const nextReviewAt = safe.nextReviewAt ?? new Date(lastAttemptAt.getTime() + intervalDays * DAY_MS);

    return {
      easeFactor: safe.easeFactor ?? DEFAULT_EASE,
      intervalDays,
      repetitions: safe.repetitions ?? 0,
      nextReviewAt,
      lastQuality: safe.lastQuality ?? 0,
      lastResponseMs: safe.lastResponseMs,
      difficulty: safe.difficulty ?? 0.5
    };
  }

  calculateSm2Update(
    previous: AdaptiveProgress | null | undefined,
    isCorrect: boolean,
    responseTimeMs: number | null | undefined,
    now = new Date()
  ): AdaptiveUpdate {
    const base = this.normalizeProgress(previous, now);
    const quality = this.computeQuality(isCorrect, responseTimeMs);

    let easeFactor = base.easeFactor;
    let repetitions = base.repetitions;
    let intervalDays = base.intervalDays;

    if (quality < 3) {
      repetitions = 0;
      intervalDays = 1;
    } else {
      repetitions += 1;
      if (repetitions === 1) {
        intervalDays = 1;
      } else if (repetitions === 2) {
        intervalDays = 6;
      } else {
        intervalDays = Math.max(1, Math.round(Math.max(intervalDays, 1) * easeFactor));
      }
    }

    const efAdjustment = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
    easeFactor = this.clamp(easeFactor + efAdjustment, MIN_EASE, MAX_EASE);

    const nextReviewAt = new Date(now.getTime() + intervalDays * DAY_MS);
    const difficulty = this.updateDifficulty(base.difficulty, isCorrect, responseTimeMs);

    return {
      easeFactor,
      intervalDays,
      repetitions,
      nextReviewAt,
      lastQuality: quality,
      lastResponseMs: responseTimeMs,
      difficulty,
      quality
    };
  }

  getDaysUntilDue(progress: AdaptiveProgress | null | undefined, now = new Date()): number {
    if (!progress?.nextReviewAt) {
      return 0;
    }
    const diff = progress.nextReviewAt.getTime() - now.getTime();
    return Math.ceil(diff / DAY_MS);
  }

  getDifficultyLabel(difficulty: number): 'easy' | 'medium' | 'hard' {
    if (difficulty >= 0.7) {
      return 'hard';
    }
    if (difficulty >= 0.45) {
      return 'medium';
    }
    return 'easy';
  }

  getPriorityScore(
    progress: (AdaptiveProgress & {
      level?: ProgressLevel;
      correctCount?: number;
      incorrectCount?: number;
      lastAttemptAt?: Date;
    }) | null | undefined,
    now = new Date()
  ): number {
    if (!progress) {
      return 0;
    }

    const normalized = this.normalizeProgress(progress, now);
    const level = progress.level ?? 0;
    const dueInDays = this.getDaysUntilDue(normalized, now);
    const isDue = dueInDays <= 0;
    const timeSince = progress.lastAttemptAt
      ? Math.min(30, Math.max(0, (now.getTime() - progress.lastAttemptAt.getTime()) / DAY_MS))
      : 0;
    const correct = progress.correctCount ?? 0;
    const incorrect = progress.incorrectCount ?? 0;
    const errorRatio = incorrect + correct > 0 ? incorrect / (incorrect + correct) : 0.5;

    let score = 0;
    score += isDue ? 40 : Math.max(0, 20 - dueInDays);
    score += (3 - level) * 8;
    score += (normalized.difficulty - 0.5) * 18;
    score += errorRatio * 12;
    score += timeSince * 0.4;

    return score;
  }

  sortByPriority<T extends { progress: AdaptiveProgress; question?: { orderIndex?: number } }>(
    items: T[],
    now = new Date()
  ): T[] {
    const withScores = items.map(item => ({
      item,
      score: this.getPriorityScore(item.progress, now),
      orderIndex: item.question?.orderIndex ?? 0
    }));

    return withScores
      .sort((a, b) => {
        if (b.score === a.score) {
          return a.orderIndex - b.orderIndex;
        }
        return b.score - a.score;
      })
      .map(entry => entry.item);
  }

  recordAttempt(options: {
    userId: string;
    progress: AdaptiveProgress & { lastAttemptAt?: Date; level?: ProgressLevel };
    isCorrect: boolean;
    responseTimeMs?: number | null;
    attemptedAt?: Date;
  }): void {
    if (!options.userId) {
      return;
    }

    const now = options.attemptedAt ?? new Date();
    const lastAttemptAt = options.progress.lastAttemptAt ?? now;
    const daysSince = Math.max(0, (now.getTime() - lastAttemptAt.getTime()) / DAY_MS);
    const features = this.buildFeatures(options.progress, {
      daysSince,
      responseTimeMs: options.responseTimeMs,
      level: options.progress.level ?? 0
    });

    const sample: TrainingSample = {
      features,
      label: options.isCorrect ? 1 : 0,
      timestamp: now.getTime()
    };

    const samples = this.loadSamples(options.userId);
    samples.push(sample);
    if (samples.length > MAX_SAMPLES) {
      samples.splice(0, samples.length - MAX_SAMPLES);
    }
    this.saveSamples(options.userId, samples);

    if (samples.length >= MIN_TRAIN_SAMPLES) {
      this.queueTraining(options.userId);
    }
  }

  predictForgetInDays(
    progress: AdaptiveProgress | null | undefined,
    userId?: string,
    now = new Date()
  ): number {
    const normalized = this.normalizeProgress(progress, now);
    const fallback = Math.max(1, Math.round(Math.max(1, normalized.intervalDays) * 0.9));

    if (!userId) {
      return fallback;
    }

    const model = this.userModels.get(userId);
    if (!model || !this.tf) {
      return fallback;
    }

    for (let day = 0; day <= MAX_PREDICT_DAYS; day += 1) {
      const probability = this.predictRecallProbability(model, normalized, day, normalized.lastResponseMs, progress);
      if (probability < 0.5) {
        return Math.max(1, day);
      }
    }

    return MAX_PREDICT_DAYS;
  }

  private updateDifficulty(
    difficulty: number,
    isCorrect: boolean,
    responseTimeMs?: number | null
  ): number {
    let next = difficulty + (isCorrect ? -0.05 : 0.12);

    if (responseTimeMs !== undefined && responseTimeMs !== null) {
      const speedPenalty = Math.min(1, responseTimeMs / 12000);
      next += speedPenalty * 0.06;
    }

    return this.clamp(next, 0, 1);
  }

  private predictRecallProbability(
    model: import('@tensorflow/tfjs').LayersModel,
    progress: AdaptiveProgress,
    daysSince: number,
    responseTimeMs?: number | null,
    rawProgress?: AdaptiveProgress | null
  ): number {
    if (!this.tf) {
      return 0.5;
    }

    const features = this.buildFeatures(progress, {
      daysSince,
      responseTimeMs,
      level: (rawProgress as any)?.level ?? 0
    });

    const input = this.tf.tensor2d([features], [1, FEATURE_COUNT]);
    const output = model.predict(input) as import('@tensorflow/tfjs').Tensor;
    const value = output.dataSync()[0] ?? 0.5;

    input.dispose();
    output.dispose();

    return value;
  }

  private buildFeatures(
    progress: AdaptiveProgress,
    options: { daysSince: number; responseTimeMs?: number | null; level: number }
  ): number[] {
    const daysNorm = Math.min(MAX_PREDICT_DAYS, Math.max(0, options.daysSince)) / MAX_PREDICT_DAYS;
    const easeNorm = (progress.easeFactor ?? DEFAULT_EASE) / MAX_EASE;
    const repetitionNorm = Math.min(10, progress.repetitions ?? 0) / 10;
    const difficultyNorm = progress.difficulty ?? 0.5;
    const responseNorm = options.responseTimeMs !== undefined && options.responseTimeMs !== null
      ? Math.min(1, options.responseTimeMs / 15000)
      : 0.5;
    const levelNorm = Math.min(3, Math.max(0, options.level)) / 3;

    return [daysNorm, easeNorm, repetitionNorm, difficultyNorm, responseNorm, levelNorm];
  }

  private loadSamples(userId: string): TrainingSample[] {
    const cached = this.userSamples.get(userId);
    if (cached) {
      return cached;
    }

    if (typeof localStorage === 'undefined') {
      const empty: TrainingSample[] = [];
      this.userSamples.set(userId, empty);
      return empty;
    }

    const raw = localStorage.getItem(this.getStorageKey(userId));
    if (!raw) {
      const empty: TrainingSample[] = [];
      this.userSamples.set(userId, empty);
      return empty;
    }

    try {
      const parsed = JSON.parse(raw) as TrainingSample[];
      const filtered = Array.isArray(parsed)
        ? parsed.filter(sample => Array.isArray(sample.features) && sample.features.length === FEATURE_COUNT)
        : [];
      this.userSamples.set(userId, filtered);
      return filtered;
    } catch {
      const empty: TrainingSample[] = [];
      this.userSamples.set(userId, empty);
      return empty;
    }
  }

  private saveSamples(userId: string, samples: TrainingSample[]): void {
    this.userSamples.set(userId, samples);
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(this.getStorageKey(userId), JSON.stringify(samples));
    } catch {
      // Ignore storage errors (quota, privacy mode, etc.)
    }
  }

  private queueTraining(userId: string): void {
    if (this.trainingUsers.has(userId)) {
      return;
    }
    this.trainingUsers.add(userId);
    setTimeout(() => {
      this.trainModel(userId).finally(() => {
        this.trainingUsers.delete(userId);
      });
    }, 0);
  }

  private async trainModel(userId: string): Promise<void> {
    const samples = this.loadSamples(userId);
    if (samples.length < MIN_TRAIN_SAMPLES) {
      return;
    }

    const tf = await this.ensureTf();
    if (!tf) {
      return;
    }

    const features = samples.map(sample => sample.features);
    const labels = samples.map(sample => sample.label);

    const xs = tf.tensor2d(features, [features.length, FEATURE_COUNT]);
    const ys = tf.tensor2d(labels, [labels.length, 1]);

    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 8, activation: 'relu', inputShape: [FEATURE_COUNT] }));
    model.add(tf.layers.dense({ units: 4, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    model.compile({ optimizer: tf.train.adam(0.01), loss: 'binaryCrossentropy' });

    try {
      await model.fit(xs, ys, { epochs: 20, batchSize: 16, shuffle: true, verbose: 0 });
      const existing = this.userModels.get(userId);
      if (existing) {
        existing.dispose();
      }
      this.userModels.set(userId, model);
    } finally {
      xs.dispose();
      ys.dispose();
    }
  }

  private async ensureTf(): Promise<typeof import('@tensorflow/tfjs') | null> {
    if (this.tf) {
      return this.tf;
    }

    try {
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();
      this.tf = tf;
      return tf;
    } catch {
      return null;
    }
  }

  private getStorageKey(userId: string): string {
    return `adaptive-learning-events:${userId}`;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
