import { useRef, useEffect, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';
import './DotGrid.css';

const throttle = (func, limit) => {
    let lastCall = 0;
    return function (...args) {
        const now = performance.now();
        if (now - lastCall >= limit) {
            lastCall = now;
            func.apply(this, args);
        }
    };
};

function hexToRgb(hex) {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return { r: 0, g: 0, b: 0 };
    return {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16)
    };
}

const DotGrid = ({
    dotSize = 16,
    gap = 32,
    baseColor = '#5227FF',
    activeColor = '#5227FF',
    proximity = 150,
    speedTrigger = 100,
    shockRadius = 250,
    shockStrength = 5,
    maxSpeed = 5000,
    resistance = 750,
    returnDuration = 1.5,
    className = '',
    style
}) => {
    const wrapperRef = useRef(null);
    const canvasRef = useRef(null);
    const dotsRef = useRef([]);
    const gridMetaRef = useRef(null);
    const pointerRef = useRef({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        speed: 0,
        lastTime: 0,
        lastX: 0,
        lastY: 0
    });

    const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
    const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);

    const circlePath = useMemo(() => {
        if (typeof window === 'undefined' || !window.Path2D) return null;

        const p = new window.Path2D();
        p.arc(0, 0, dotSize / 2, 0, Math.PI * 2);
        return p;
    }, [dotSize]);

    const buildGrid = useCallback(() => {
        const wrap = wrapperRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !canvas) return;

        const { width, height } = wrap.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);

        const cols = Math.floor((width + gap) / (dotSize + gap));
        const rows = Math.floor((height + gap) / (dotSize + gap));
        const cell = dotSize + gap;

        const gridW = cell * cols - gap;
        const gridH = cell * rows - gap;

        const extraX = width - gridW;
        const extraY = height - gridH;

        const startX = extraX / 2 + dotSize / 2;
        const startY = extraY / 2 + dotSize / 2;

        const dots = [];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const cx = startX + x * cell;
                const cy = startY + y * cell;
                dots.push({ cx, cy, xOffset: 0, yOffset: 0, _pushed: false, col: x, row: y });
            }
        }
        dotsRef.current = dots;
        // Store grid metadata for spatial lookups
        gridMetaRef.current = { cols, rows, cell, startX, startY };
    }, [dotSize, gap]);

    useEffect(() => {
        if (!circlePath) return;

        let rafId;
        const proxSq = proximity * proximity;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const draw = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const { x: px, y: py } = pointerRef.current;

            for (const dot of dotsRef.current) {
                const ox = dot.cx + dot.xOffset;
                const oy = dot.cy + dot.yOffset;
                const dx = dot.cx - px;
                const dy = dot.cy - py;
                const dsq = dx * dx + dy * dy;

                let fillStyle = baseColor;
                if (dsq <= proxSq) {
                    const dist = Math.sqrt(dsq);
                    const t = 1 - dist / proximity;
                    const r = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * t);
                    const g = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * t);
                    const b = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * t);
                    fillStyle = `rgb(${r},${g},${b})`;
                }

                // Avoid expensive save/restore — use setTransform instead
                ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
                ctx.fillStyle = fillStyle;
                ctx.fill(circlePath);
            }
            // Reset transform
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            rafId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(rafId);
    }, [proximity, baseColor, activeRgb, baseRgb, circlePath]);

    useEffect(() => {
        buildGrid();
        let ro = null;
        if ('ResizeObserver' in window) {
            ro = new ResizeObserver(buildGrid);
            wrapperRef.current && ro.observe(wrapperRef.current);
        } else {
            window.addEventListener('resize', buildGrid);
        }
        return () => {
            if (ro) ro.disconnect();
            else window.removeEventListener('resize', buildGrid);
        };
    }, [buildGrid]);

    useEffect(() => {
        const getNearbyDots = (px, py, radius) => {
            const meta = gridMetaRef.current;
            const dots = dotsRef.current;
            if (!meta || !dots.length) return dots; // fallback
            const { cols, rows, cell, startX, startY } = meta;
            const minCol = Math.max(0, Math.floor((px - radius - startX) / cell));
            const maxCol = Math.min(cols - 1, Math.ceil((px + radius - startX) / cell));
            const minRow = Math.max(0, Math.floor((py - radius - startY) / cell));
            const maxRow = Math.min(rows - 1, Math.ceil((py + radius - startY) / cell));
            const nearby = [];
            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    const idx = r * cols + c;
                    if (idx >= 0 && idx < dots.length) nearby.push(dots[idx]);
                }
            }
            return nearby;
        };

        const onMove = e => {
            const now = performance.now();
            const pr = pointerRef.current;
            const dt = pr.lastTime ? now - pr.lastTime : 16;
            const dx = e.clientX - pr.lastX;
            const dy = e.clientY - pr.lastY;
            let vx = (dx / dt) * 1000;
            let vy = (dy / dt) * 1000;
            let speed = Math.hypot(vx, vy);
            if (speed > maxSpeed) {
                const scale = maxSpeed / speed;
                vx *= scale;
                vy *= scale;
                speed = maxSpeed;
            }
            pr.lastTime = now;
            pr.lastX = e.clientX;
            pr.lastY = e.clientY;
            pr.vx = vx;
            pr.vy = vy;
            pr.speed = speed;

            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            pr.x = e.clientX - rect.left;
            pr.y = e.clientY - rect.top;

            if (speed <= speedTrigger) return; // skip dot iteration if not fast enough

            const nearby = getNearbyDots(pr.x, pr.y, proximity);
            for (const dot of nearby) {
                const dist = Math.hypot(dot.cx - pr.x, dot.cy - pr.y);
                if (dist < proximity && !dot._pushed) {
                    dot._pushed = true;
                    gsap.killTweensOf(dot);
                    const pushX = (dot.cx - pr.x + vx * 0.005) * 0.5;
                    const pushY = (dot.cy - pr.y + vy * 0.005) * 0.5;
                    gsap.to(dot, {
                        xOffset: pushX,
                        yOffset: pushY,
                        duration: 0.3,
                        ease: 'power2.out',
                        onComplete: () => {
                            gsap.to(dot, {
                                xOffset: 0,
                                yOffset: 0,
                                duration: returnDuration,
                                ease: 'elastic.out(1,0.75)',
                                onComplete: () => {
                                    dot._pushed = false;
                                }
                            });
                        }
                    });
                }
            }
        };

        const onClick = e => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;
            const nearby = getNearbyDots(cx, cy, shockRadius);
            for (const dot of nearby) {
                const dist = Math.hypot(dot.cx - cx, dot.cy - cy);
                if (dist < shockRadius && !dot._pushed) {
                    dot._pushed = true;
                    gsap.killTweensOf(dot);
                    const falloff = Math.max(0, 1 - dist / shockRadius);
                    const pushX = (dot.cx - cx) * shockStrength * falloff;
                    const pushY = (dot.cy - cy) * shockStrength * falloff;
                    gsap.to(dot, {
                        xOffset: pushX,
                        yOffset: pushY,
                        duration: 0.3,
                        ease: 'power2.out',
                        onComplete: () => {
                            gsap.to(dot, {
                                xOffset: 0,
                                yOffset: 0,
                                duration: returnDuration,
                                ease: 'elastic.out(1,0.75)',
                                onComplete: () => {
                                    dot._pushed = false;
                                }
                            });
                        }
                    });
                }
            }
        };

        const throttledMove = throttle(onMove, 50);
        window.addEventListener('mousemove', throttledMove, { passive: true });
        window.addEventListener('click', onClick, { passive: true });

        return () => {
            window.removeEventListener('mousemove', throttledMove);
            window.removeEventListener('click', onClick);
        };
    }, [maxSpeed, speedTrigger, proximity, returnDuration, shockRadius, shockStrength]);

    return (
        <section className={`dot-grid ${className}`} style={style}>
            <div ref={wrapperRef} className="dot-grid__wrap">
                <canvas ref={canvasRef} className="dot-grid__canvas" />
            </div>
        </section>
    );
};

export default DotGrid;
