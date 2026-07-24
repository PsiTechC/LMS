import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { assessmentsApi } from '../../api/assessments';
import { ApiError } from '../../api/client';
import { ErrorState, FullScreenLoading, PrimaryButton, SecondaryButton, TextField } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import type { AnswerInput, AssessmentDetailDTO, QuestionDTO } from '../../types/api';
import type { JourneyStackParamList } from '../../navigation/tabs/JourneyStack';

type Props = NativeStackScreenProps<JourneyStackParamList, 'AssessmentAttempt'>;

function isAnswered(q: QuestionDTO, a: AnswerInput | undefined): boolean {
  if (!a) return false;
  if (q.type === 'matching') {
    const pairCount = q.match_pairs?.length ?? 0;
    if (pairCount === 0) return true;
    const chosen = a.matches ?? {};
    for (let i = 0; i < pairCount; i++) {
      if (!chosen[String(i)]) return false;
    }
    return true;
  }
  return a.index !== undefined || (a.text !== undefined && a.text.trim().length > 0);
}

function formatClock(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000);
  const mm = Math.floor(totalSecs / 60);
  const ss = totalSecs % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

/**
 * One-question-per-page attempt wizard. Calling assessmentsApi.detail() here
 * (not on the intro screen) is what anchors a timed assessment's server-side
 * countdown on first load — a refresh/reopen resumes the SAME deadline
 * rather than resetting it, matching apps/web/components/participant/
 * AssessmentTakeModal.tsx's skew-corrected deadline math exactly.
 *
 * No client-side draft-save exists on the backend for in-progress answers —
 * answers only leave the device on final submit. Losing the screen before
 * submitting loses in-memory answers (though a timed assessment's own clock
 * keeps running server-side regardless), so both hardware back and the
 * header back button confirm before leaving mid-attempt.
 */
export function AssessmentAttemptScreen({ route, navigation }: Props) {
  const { activityId, title } = route.params;
  const [detail, setDetail] = useState<AssessmentDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [page, setPage] = useState(0); // index into questions; questions.length === review page
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const deadlineRef = useRef<number | null>(null);
  const autoSubmittedRef = useRef(false);
  const submittedRef = useRef(false); // guards the leave-confirmation once submit succeeded

  useEffect(() => {
    let cancelled = false;
    assessmentsApi
      .detail(activityId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        if (d.time_limit_mins > 0 && d.started_at) {
          const startedMs = new Date(d.started_at).getTime();
          const serverNowMs = d.server_now ? new Date(d.server_now).getTime() : startedMs;
          const skew = Date.now() - serverNowMs;
          const dl = startedMs + d.time_limit_mins * 60_000 + skew;
          deadlineRef.current = dl;
          setRemainingMs(Math.max(0, dl - Date.now()));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load this assessment.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  // Countdown tick for timed assessments.
  useEffect(() => {
    if (deadlineRef.current == null) return;
    const id = setInterval(() => {
      const left = Math.max(0, (deadlineRef.current as number) - Date.now());
      setRemainingMs(left);
      if (left <= 0) setTimedOut(true);
    }, 1000);
    return () => clearInterval(id);
  }, [detail]);

  const questions = detail?.questions ?? [];
  const totalAnswered = questions.filter((q) => isAnswered(q, answers[q.id])).length;
  const reviewPageIndex = questions.length;
  const onReviewPage = page === reviewPageIndex;
  const currentQuestion = onReviewPage ? null : questions[page];

  const submit = useCallback(async () => {
    if (!detail || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: AnswerInput[] = detail.questions.map((q) => answers[q.id] ?? { question_id: q.id });
      const result = await assessmentsApi.submit(detail.activity_id, payload);
      submittedRef.current = true;
      navigation.replace('AssessmentResult', { result });
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't submit your answers. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [detail, answers, submitting, navigation]);

  // One-shot auto-submit when the server-anchored deadline passes.
  useEffect(() => {
    if (timedOut && !autoSubmittedRef.current && detail && !submittedRef.current) {
      autoSubmittedRef.current = true;
      void submit();
    }
  }, [timedOut, detail, submit]);

  const confirmLeave = useCallback(() => {
    Alert.alert(
      'Leave assessment?',
      "Your answers haven't been submitted yet and are not saved. If this assessment is timed, the clock keeps running even if you leave.",
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    );
  }, [navigation]);

  // Header back / swipe-back confirmation.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (submittedRef.current || !detail) return; // already submitted, or nothing to lose yet
      e.preventDefault();
      confirmLeave();
    });
    return unsub;
  }, [navigation, detail, confirmLeave]);

  // Android hardware back button (native-stack's own back already routes
  // through beforeRemove, but this guards environments where it doesn't).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (submittedRef.current || !detail) return false;
      confirmLeave();
      return true;
    });
    return () => sub.remove();
  }, [detail, confirmLeave]);

  if (loading) return <FullScreenLoading label="Loading assessment…" />;

  if (loadError) {
    return (
      <View style={styles.center}>
        <ErrorState title="Couldn't load this assessment" message={loadError} actionLabel="Go Back" onAction={() => navigation.goBack()} />
      </View>
    );
  }

  if (!detail) return null;

  const locked = timedOut || submitting;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {remainingMs != null && (
          <Text style={[styles.timer, remainingMs <= 30_000 && styles.timerUrgent, remainingMs <= 120_000 && remainingMs > 30_000 && styles.timerWarn]}>
            ⏱ {formatClock(remainingMs)}
          </Text>
        )}
        <Text style={styles.progressText}>
          {onReviewPage ? 'Review' : `Q${page + 1} of ${questions.length}`} · {totalAnswered}/{questions.length} answered
        </Text>
      </View>

      {timedOut && (
        <View style={styles.timeUpBanner}>
          <Text style={styles.timeUpText}>Time's up — submitting your answers…</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} style={[locked && styles.disabled]}>
        {onReviewPage ? (
          <ReviewList questions={questions} answers={answers} onJump={(i) => setPage(i)} />
        ) : (
          currentQuestion && (
            <QuestionCard
              question={currentQuestion}
              index={page}
              value={answers[currentQuestion.id]}
              disabled={locked}
              onChange={(a) => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: a }))}
            />
          )
        )}
      </ScrollView>

      {!!submitError && <Text style={styles.submitError}>{submitError}</Text>}

      <View style={styles.footer}>
        <SecondaryButton label="← Previous" disabled={page === 0 || locked} onPress={() => setPage((p) => Math.max(0, p - 1))} style={styles.footerBtn} />
        {onReviewPage ? (
          <PrimaryButton
            label={submitting ? 'Submitting…' : 'Submit Assessment'}
            loading={submitting}
            disabled={locked}
            onPress={() =>
              totalAnswered < questions.length
                ? Alert.alert(
                    'Unanswered questions',
                    `${questions.length - totalAnswered} question${questions.length - totalAnswered === 1 ? '' : 's'} left unanswered. Submit anyway?`,
                    [
                      { text: 'Go back', style: 'cancel' },
                      { text: 'Submit anyway', style: 'destructive', onPress: submit },
                    ]
                  )
                : submit()
            }
            style={styles.footerBtn}
          />
        ) : (
          <PrimaryButton
            label={page === questions.length - 1 ? 'Review →' : 'Next →'}
            disabled={locked}
            onPress={() => setPage((p) => Math.min(reviewPageIndex, p + 1))}
            style={styles.footerBtn}
          />
        )}
      </View>
    </View>
  );
}

function ReviewList({
  questions,
  answers,
  onJump,
}: {
  questions: QuestionDTO[];
  answers: Record<string, AnswerInput>;
  onJump: (index: number) => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.reviewHeading}>Review your answers before submitting</Text>
      {questions.map((q, i) => {
        const answered = isAnswered(q, answers[q.id]);
        return (
          <Pressable key={q.id} onPress={() => onJump(i)} style={styles.reviewRow}>
            <View style={[styles.reviewDot, { backgroundColor: answered ? colors.status.success : colors.status.warning }]} />
            <Text style={styles.reviewRowText} numberOfLines={1}>
              Q{i + 1}. {q.text}
            </Text>
            <Text style={styles.reviewRowStatus}>{answered ? 'Answered' : 'Unanswered'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function QuestionCard({
  question,
  index,
  value,
  disabled,
  onChange,
}: {
  question: QuestionDTO;
  index: number;
  value: AnswerInput | undefined;
  disabled?: boolean;
  onChange: (a: AnswerInput) => void;
}) {
  return (
    <View>
      <View style={styles.questionHeaderRow}>
        <Text style={styles.questionText}>
          <Text style={styles.questionIndex}>Q{index + 1}. </Text>
          {question.text}
        </Text>
        <Text style={styles.questionPoints}>
          {question.points} pt{question.points === 1 ? '' : 's'}
        </Text>
      </View>
      <QuestionInput question={question} value={value} disabled={disabled} onChange={onChange} />
    </View>
  );
}

function QuestionInput({
  question,
  value,
  disabled,
  onChange,
}: {
  question: QuestionDTO;
  value: AnswerInput | undefined;
  disabled?: boolean;
  onChange: (a: AnswerInput) => void;
}) {
  if (question.type === 'mcq') {
    return (
      <View style={{ gap: spacing.sm }}>
        {(question.options ?? []).map((opt, oi) => {
          const selected = value?.index === oi;
          return (
            <Pressable
              key={oi}
              disabled={disabled}
              onPress={() => onChange({ question_id: question.id, index: oi })}
              style={[styles.optionRow, selected && styles.optionRowSelected]}
            >
              <View style={[styles.radio, selected && styles.radioSelected]} />
              <Text style={styles.optionText}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (question.type === 'true_false') {
    return (
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {['True', 'False'].map((label, oi) => {
          const selected = value?.index === oi;
          return (
            <Pressable
              key={label}
              disabled={disabled}
              onPress={() => onChange({ question_id: question.id, index: oi })}
              style={[styles.tfOption, selected && styles.optionRowSelected]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (question.type === 'matching') {
    const rights = (question.match_pairs ?? []).map((p) => p.right);
    const matches = value?.matches ?? {};
    return (
      <View style={{ gap: spacing.lg }}>
        {(question.match_pairs ?? []).map((pair, li) => {
          const chosen = matches[String(li)];
          return (
            <View key={li} style={{ gap: spacing.xs }}>
              <Text style={styles.matchLeft}>{pair.left}</Text>
              <View style={styles.matchChipRow}>
                {rights.map((r, ri) => {
                  const selected = chosen === r;
                  return (
                    <Pressable
                      key={ri}
                      disabled={disabled}
                      onPress={() =>
                        onChange({ question_id: question.id, matches: { ...matches, [String(li)]: r } })
                      }
                      style={[styles.matchChip, selected && styles.optionRowSelected]}
                    >
                      <Text style={[styles.matchChipText, selected && styles.optionTextSelected]}>{r}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  // open (faculty-graded free text)
  return (
    <TextField
      label="Your response"
      value={value?.text ?? ''}
      editable={!disabled}
      onChangeText={(t) => onChange({ question_id: question.id, text: t })}
      multiline
      numberOfLines={6}
      style={{ minHeight: 110, textAlignVertical: 'top' }}
      placeholder="Type your response here…"
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, backgroundColor: colors.surface.page, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  header: {
    backgroundColor: colors.brand.navy,
    padding: spacing.lg,
    gap: 6,
  },
  headerTitle: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text.inverse },
  progressText: { fontFamily: fontFamily.medium, fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  timer: {
    alignSelf: 'flex-start',
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.text.inverse,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  timerWarn: { backgroundColor: colors.status.warning },
  timerUrgent: { backgroundColor: colors.status.danger },
  timeUpBanner: { backgroundColor: 'rgba(239,68,68,0.1)', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.surface.border },
  timeUpText: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.status.danger, textAlign: 'center' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  questionHeaderRow: { marginBottom: spacing.lg },
  questionIndex: { color: colors.brand.gold, fontFamily: fontFamily.extraBold },
  questionText: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.text.primary, lineHeight: 20 },
  questionPoints: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.text.secondary, marginTop: 4 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.surface.border,
    borderRadius: 10,
    backgroundColor: colors.surface.card,
    minHeight: 44,
  },
  optionRowSelected: { borderColor: colors.brand.gold, backgroundColor: 'rgba(200,168,96,0.08)' },
  optionText: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.text.primary, flex: 1 },
  optionTextSelected: { color: colors.brand.gold, fontFamily: fontFamily.semiBold },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.status.inactive },
  radioSelected: { borderColor: colors.brand.gold, backgroundColor: colors.brand.gold },
  tfOption: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.surface.border,
    borderRadius: 10,
    backgroundColor: colors.surface.card,
    minHeight: 44,
    justifyContent: 'center',
  },
  matchLeft: { fontFamily: fontFamily.semiBold, fontSize: 12, color: colors.text.primary },
  matchChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  matchChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: colors.surface.border,
    borderRadius: 20,
    backgroundColor: colors.surface.card,
  },
  matchChipText: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.text.primary },
  reviewHeading: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text.primary, marginBottom: spacing.sm },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: 8,
    backgroundColor: colors.surface.card,
    minHeight: 44,
  },
  reviewDot: { width: 8, height: 8, borderRadius: 4 },
  reviewRowText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 12, color: colors.text.primary },
  reviewRowStatus: { fontFamily: fontFamily.bold, fontSize: 10, color: colors.text.secondary },
  submitError: { paddingHorizontal: spacing.xl, fontFamily: fontFamily.medium, fontSize: 12, color: colors.status.danger },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surface.border,
    backgroundColor: colors.surface.card,
  },
  footerBtn: { flex: 1 },
});
