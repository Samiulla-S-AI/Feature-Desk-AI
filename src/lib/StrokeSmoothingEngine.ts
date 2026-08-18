/**
 * ════════════════════════════════════════════════════════════════════════════════════
 * STROKE SMOOTHING ENGINE — OPEN-SOURCE QUALITY HANDWRITING & DIGITAL INK ENGINE
 * ════════════════════════════════════════════════════════════════════════════════════
 *
 * Algorithmic Features:
 * 1. COALESCED POINTER EVENT EXTRACTION:
 *    Extracts sub-frame high-frequency sampling points from e.nativeEvent.getCoalescedEvents()
 *    (up to 240Hz sampling on Apple Pencil, Surface Pen, and high-DPI digitizers).
 *
 * 2. REAL-TIME LOW-PASS / STREAMLINE SMOOTHING & MIN-DISTANCE FILTERING:
 *    Applies a progressive exponential moving average (EMA) position low-pass filter
 *    where each point smooths against the PREVIOUSLY SMOOTHED point (not a stale anchor),
 *    preserving curve fidelity in fast S-shapes, loops, and reversals.
 *
 * 3. MIDPOINT QUADRATIC BEZIER SPLINE INTERPOLATION:
 *    Replaces piecewise straight line segments (ctx.lineTo) with C1-continuous quadratic
 *    Bezier splines using midpoints between consecutive points as endpoints and raw points
 *    as control points.
 *
 * 4. VELOCITY & PRESSURE DYNAMIC INK SCALING:
 *    Dynamically adjusts line width based on real-time stroke velocity and stylus pressure,
 *    simulating physical paper handwriting (fountain pen / ballpoint pen feel).
 *
 * 5. ZERO-LATENCY LIVE BATCH RENDERER:
 *    Renders ALL incremental Bezier segments from a coalesced batch immediately,
 *    not just the last segment. This eliminates dropped curves during fast continuous writing.
 * ════════════════════════════════════════════════════════════════════════════════════
 */

export interface SmoothPoint {
  x: number;
  y: number;
  pressure?: number;
  time?: number;
}

export class StrokeSmoothingEngine {
  /**
   * Extract high-frequency coalesced points from a PointerEvent if supported by browser/hardware.
   * Standard mousemove/pointermove fires ~60-120Hz; getCoalescedEvents() can fire up to 240Hz+.
   */
  public static getCoalescedPoints(
    e: React.PointerEvent<HTMLCanvasElement> | PointerEvent,
    scaleX: number = 1,
    scaleY: number = 1,
    rect?: DOMRect
  ): SmoothPoint[] {
    const points: SmoothPoint[] = [];
    const nativeEvt = 'nativeEvent' in e ? e.nativeEvent : e;
    const bounds = rect || (e.target as HTMLElement)?.getBoundingClientRect?.();
    const left = bounds ? bounds.left : 0;
    const top = bounds ? bounds.top : 0;

    // Check if hardware coalesced events are available
    if (typeof nativeEvt.getCoalescedEvents === 'function') {
      try {
        const coalesced = nativeEvt.getCoalescedEvents();
        if (coalesced && coalesced.length > 0) {
          for (let i = 0; i < coalesced.length; i++) {
            const c = coalesced[i];
            points.push({
              x: (c.clientX - left) * scaleX,
              y: (c.clientY - top) * scaleY,
              pressure: c.pressure > 0 ? c.pressure : 0.5,
              time: c.timeStamp || performance.now()
            });
          }
          return points;
        }
      } catch (_) {
        // Fall back to main event if getCoalescedEvents throws (e.g. security sandbox)
      }
    }

    // Fallback single event point
    points.push({
      x: (nativeEvt.clientX - left) * scaleX,
      y: (nativeEvt.clientY - top) * scaleY,
      pressure: nativeEvt.pressure > 0 ? nativeEvt.pressure : 0.5,
      time: nativeEvt.timeStamp || performance.now()
    });

    return points;
  }

  /**
   * Apply exponential moving average (EMA) low-pass filter to smooth micro-jitter.
   * alpha parameter (0 to 1): lower = smoother (more filtering), higher = more responsive.
   * Default alpha=0.65 balances jitter reduction with fast direction-change responsiveness.
   */
  public static smoothPoint(prev: SmoothPoint, curr: SmoothPoint, alpha: number = 0.65): SmoothPoint {
    return {
      x: prev.x + (curr.x - prev.x) * alpha,
      y: prev.y + (curr.y - prev.y) * alpha,
      pressure: (prev.pressure ?? 0.5) + ((curr.pressure ?? 0.5) - (prev.pressure ?? 0.5)) * alpha,
      time: curr.time
    };
  }

  /**
   * PROGRESSIVE BATCH SMOOTHING:
   * Smooths an array of raw coalesced points against a starting anchor,
   * where each successive point is smoothed against the PREVIOUSLY SMOOTHED point
   * (not the original anchor). This preserves curve trajectory during fast S-curves
   * and loops, unlike flat-anchor smoothing which collapses multiple points together.
   *
   * Returns the array of smoothed points ready to be appended to the stroke buffer.
   */
  public static smoothBatch(
    anchor: SmoothPoint,
    rawPoints: SmoothPoint[],
    alpha: number = 0.65
  ): SmoothPoint[] {
    if (rawPoints.length === 0) return [];
    const result: SmoothPoint[] = [];
    let prev = anchor;

    for (let i = 0; i < rawPoints.length; i++) {
      const smoothed = StrokeSmoothingEngine.smoothPoint(prev, rawPoints[i], alpha);
      result.push(smoothed);
      prev = smoothed; // Chain: next point smooths against THIS smoothed point
    }

    return result;
  }

  /**
   * Filter out redundant micro-points that are too close to the previous point.
   * Threshold lowered to 0.3px to prevent eating valid curve detail on high-DPI displays.
   * Only filters for full stroke redraws; live rendering skips this entirely.
   */
  public static filterMicroPoints(points: SmoothPoint[], minDistance: number = 0.3): SmoothPoint[] {
    if (points.length <= 1) return points;
    const filtered: SmoothPoint[] = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const last = filtered[filtered.length - 1];
      const curr = points[i];
      const dist = Math.hypot(curr.x - last.x, curr.y - last.y);

      // Keep point if distance >= minDistance or if it's the final point
      if (dist >= minDistance || i === points.length - 1) {
        filtered.push(curr);
      }
    }

    return filtered;
  }

  /**
   * Calculate dynamic stroke width based on drawing velocity and stylus pressure.
   * Fast movement -> slightly narrower stroke (fountain pen effect)
   * Slow movement -> full ink width
   */
  public static getDynamicWidth(
    baseSize: number,
    p1: SmoothPoint,
    p2: SmoothPoint,
    isHighlighter: boolean = false
  ): number {
    if (isHighlighter) return baseSize * 3; // Highlighters maintain uniform block width

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    const dt = (p2.time && p1.time && p2.time > p1.time) ? (p2.time - p1.time) : 16;
    const velocity = dist / Math.max(dt, 1); // px/ms

    // Velocity factor: ranges from 0.7 (fast) to 1.15 (slow/deliberate)
    const velFactor = Math.max(0.7, Math.min(1.15, 1.15 - velocity * 0.15));

    // Pressure factor: if stylus pressure is available (0 to 1)
    const pressure = p2.pressure !== undefined && p2.pressure > 0 ? p2.pressure : 0.5;
    const pressureFactor = 0.5 + pressure * 0.8; // 0.5 to 1.3

    return baseSize * velFactor * pressureFactor;
  }

  /**
   * Render a complete stroke with smooth Midpoint Quadratic Bezier Curves.
   * Used for full canvas redraws and finalizing strokes on pointerup.
   */
  public static renderSmoothStroke(
    ctx: CanvasRenderingContext2D,
    points: SmoothPoint[],
    color: string,
    baseSize: number,
    isHighlighter: boolean = false
  ): void {
    if (!points || points.length === 0) return;

    // Light micro-point filtering for redraw optimization (very low threshold)
    const cleanPoints = StrokeSmoothingEngine.filterMicroPoints(points, 0.3);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    if (isHighlighter) {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = baseSize * 3;
    } else {
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = baseSize;
    }

    // 1. Single point (Dot tap)
    if (cleanPoints.length === 1) {
      ctx.beginPath();
      ctx.arc(cleanPoints[0].x, cleanPoints[0].y, Math.max(baseSize / 2, 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // 2. Two points (Short segment)
    if (cleanPoints.length === 2) {
      ctx.beginPath();
      ctx.moveTo(cleanPoints[0].x, cleanPoints[0].y);
      ctx.lineTo(cleanPoints[1].x, cleanPoints[1].y);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // 3. Three or more points: Smooth Midpoint Quadratic Bezier Spline
    ctx.beginPath();
    ctx.moveTo(cleanPoints[0].x, cleanPoints[0].y);

    // Draw curve from start point to midpoint of p0-p1
    let midX = (cleanPoints[0].x + cleanPoints[1].x) / 2;
    let midY = (cleanPoints[0].y + cleanPoints[1].y) / 2;
    ctx.lineTo(midX, midY);

    // Quadratic Bezier curves between midpoints, using raw points as control points
    for (let i = 1; i < cleanPoints.length - 1; i++) {
      const pCurr = cleanPoints[i];
      const pNext = cleanPoints[i + 1];
      const nextMidX = (pCurr.x + pNext.x) / 2;
      const nextMidY = (pCurr.y + pNext.y) / 2;

      ctx.quadraticCurveTo(pCurr.x, pCurr.y, nextMidX, nextMidY);
    }

    // Line to final point
    const lastPoint = cleanPoints[cleanPoints.length - 1];
    ctx.lineTo(lastPoint.x, lastPoint.y);

    ctx.stroke();
    ctx.restore();
  }

  /**
   * ZERO-LATENCY LIVE BATCH RENDERER
   * Draws ALL new incremental Bezier segments that were added since the last render.
   *
   * Unlike the old renderLiveSegment (which only drew the LAST 3 points), this method
   * accepts the full stroke buffer and a `fromIndex` indicating where the last render
   * stopped. It draws every segment from fromIndex to the end of the buffer.
   *
   * This eliminates the root cause of dropped curves during fast continuous writing
   * where multiple coalesced points arrive in a single pointermove event.
   *
   * @param ctx        - Canvas 2D rendering context
   * @param points     - The FULL stroke point buffer
   * @param fromIndex  - Index in points[] where the previous render ended (start drawing from here)
   * @param color      - Stroke color
   * @param baseSize   - Base brush size
   * @param isHighlighter - Whether to render as highlighter
   */
  public static renderLiveBatch(
    ctx: CanvasRenderingContext2D,
    points: SmoothPoint[],
    fromIndex: number,
    color: string,
    baseSize: number,
    isHighlighter: boolean = false
  ): void {
    const len = points.length;
    if (len < 2 || fromIndex >= len) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;

    if (isHighlighter) {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = baseSize * 3;
    } else {
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = baseSize;
    }

    // Determine the effective start index for rendering segments
    // We need at least the point before fromIndex for context
    const startIdx = Math.max(1, fromIndex);

    for (let i = startIdx; i < len; i++) {
      if (i === 1 && startIdx === 1) {
        // Very first segment: straight line from point 0 to point 1
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.stroke();
      } else if (i >= 2) {
        // Incremental Bezier segment using midpoint interpolation
        const pPrev = points[i - 2];
        const pCtrl = points[i - 1];
        const pCurr = points[i];

        const prevMidX = (pPrev.x + pCtrl.x) / 2;
        const prevMidY = (pPrev.y + pCtrl.y) / 2;
        const currMidX = (pCtrl.x + pCurr.x) / 2;
        const currMidY = (pCtrl.y + pCurr.y) / 2;

        ctx.beginPath();
        ctx.moveTo(prevMidX, prevMidY);
        ctx.quadraticCurveTo(pCtrl.x, pCtrl.y, currMidX, currMidY);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * LEGACY: Single-segment live renderer (kept for backward compatibility).
   * Prefer renderLiveBatch for new code.
   */
  public static renderLiveSegment(
    ctx: CanvasRenderingContext2D,
    points: SmoothPoint[],
    color: string,
    baseSize: number,
    isHighlighter: boolean = false
  ): void {
    const len = points.length;
    if (len < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;

    if (isHighlighter) {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = baseSize * 3;
    } else {
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = baseSize;
    }

    if (len === 2) {
      // First segment: straight line from start to current point
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
    } else {
      // Incremental curve segment between midpoints
      const pPrev = points[len - 3];
      const pCtrl = points[len - 2];
      const pCurr = points[len - 1];

      const prevMidX = (pPrev.x + pCtrl.x) / 2;
      const prevMidY = (pPrev.y + pCtrl.y) / 2;
      const currMidX = (pCtrl.x + pCurr.x) / 2;
      const currMidY = (pCtrl.y + pCurr.y) / 2;

      ctx.beginPath();
      ctx.moveTo(prevMidX, prevMidY);
      ctx.quadraticCurveTo(pCtrl.x, pCtrl.y, currMidX, currMidY);
      ctx.stroke();
    }

    ctx.restore();
  }
}
