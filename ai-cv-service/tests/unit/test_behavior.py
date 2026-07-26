import pytest
from behavior.attention_scorer import AttentionScorer
from behavior.attention_engine import AttentionEngine
from api.v1.schemas.responses import AttentionState
from behavior.flag_detector import FlagDetector


def test_attention_perfect():
    scorer = AttentionScorer()
    score = scorer.score({"yaw": 0, "pitch": 0, "roll": 0}, {"ear_left": 0.3, "ear_right": 0.3})
    assert score == 100.0


def test_attention_head_turned_away():
    # Spatial score penalises turning the head, not eye closure.
    scorer = AttentionScorer()
    score = scorer.score({"yaw": 45, "pitch": 0, "roll": 0}, {"ear_left": 0.3, "ear_right": 0.3})
    assert score <= 75.0


def test_attention_eyes_closed_not_penalised_spatially():
    # Eye closure is a temporal signal (engine), not part of the spatial score.
    scorer = AttentionScorer()
    score = scorer.score({"yaw": 0, "pitch": 0, "roll": 0}, {"ear_left": 0.15, "ear_right": 0.15})
    assert score == 100.0


def test_attention_no_face():
    scorer = AttentionScorer()
    assert scorer.score(None, None) == 0.0


def test_engine_blink_stays_focused():
    """A brief blink must not drop below Focused; sustained closure escalates."""
    eng = AttentionEngine()
    head = {"yaw": 0.0, "pitch": 0.0}
    open_eye = {"ear_left": 0.30, "ear_right": 0.30}
    closed_eye = {"ear_left": 0.10, "ear_right": 0.10}
    t = 100_000
    for i in range(20):  # warm the EMA with attentive frames
        eng.update(0, t + i * 100, 100.0, open_eye, head)
    r_blink = eng.update(0, t + 2200, 100.0, closed_eye, head)  # 0.2s closure
    assert r_blink.state == AttentionState.FOCUSED


def test_engine_sleep_after_threshold():
    eng = AttentionEngine()
    head = {"yaw": 0.0, "pitch": 0.0}
    closed_eye = {"ear_left": 0.10, "ear_right": 0.10}
    eng.update(0, 0, 100.0, closed_eye, head)
    r = eng.update(0, 21_000, 100.0, closed_eye, head)  # 21s closed
    assert r.state == AttentionState.SLEEPING
    assert r.attention == 0.0


def test_engine_absent_without_face():
    eng = AttentionEngine()
    r = eng.update(0, 0, 0.0, None, None)
    assert r.state == AttentionState.ABSENT


def test_flag_phone():
    fd = FlagDetector()
    flags = fd.detect({"ear_left": 0.3, "ear_right": 0.3}, {"phone": True}, {"landmarks": []})
    assert flags["phone_detected"] is True


def test_flag_left_desk():
    fd = FlagDetector()
    flags = fd.detect(None, {}, None)
    assert flags["left_desk"] is True
