#!/usr/bin/env python3
"""Rebuild Day 1 silent demo MP4 from captures.

Visual pattern (keep when regenerating for later birthday days):
- Canvas: 1440x1080, black letterbox
- Silent, captions only (no voiceover)
- 5s black title card (text centered, teal accent bars)
- Before EACH content section: 5s black "Expect" card (what to expect)
- Then the content (still or live clip)
- Full-IDE screen recordings: scale-to-fit (fill frame, may letterbox)
- Small UI crops (e.g. Agent Hooks panel): NEVER upscale — native size,
  centered on black
- Live clips: bottom caption bar overlay
- 5s black end card (repo + hashtags)
- Encode: H.264 (libopenh264 or libx264), yuv420p, ~2500k, +faststart

Usage (from repo root or this directory):
  python3 build-demo.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
W, H = 1440, 1080
BG = (0, 0, 0)
TEAL = (56, 189, 168)
WHITE = (245, 248, 250)
MUTED = (170, 178, 186)
ACCENT = (120, 220, 200)
CARD_SECS = 5
OUT = HERE / "day-01-docs-sync-demo.mp4"

# Source captures (must exist)
SRC_HOOKS = HERE / "02-hooks-panel.png"
SRC_LIVE_03 = HERE / "03-src-save-docs-sync.mp4"
SRC_LIVE_04 = HERE / "04-ready-yml-docs-sync.mp4"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/montserrat-fonts/Montserrat-Bold.ttf"
        if bold
        else "/usr/share/fonts/montserrat-fonts/Montserrat-Regular.ttf",
        "/usr/share/fonts/google-noto/NotoSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/google-noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/abattis-cantarell/Cantarell-Bold.otf"
        if bold
        else "/usr/share/fonts/abattis-cantarell/Cantarell-Regular.otf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_centered(
    draw: ImageDraw.ImageDraw,
    lines: list[tuple[str, ImageFont.ImageFont, tuple[int, int, int]]],
    gap: int = 18,
) -> None:
    measured: list[tuple[str, ImageFont.ImageFont, tuple[int, int, int], int, int]] = []
    total_h = 0
    for text, fnt, color in lines:
        bbox = draw.textbbox((0, 0), text, font=fnt)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        measured.append((text, fnt, color, tw, th))
        total_h += th + gap
    total_h -= gap
    y = (H - total_h) // 2
    for text, fnt, color, tw, th in measured:
        draw.text(((W - tw) // 2, y), text, font=fnt, fill=color)
        y += th + gap


def black_card(path: Path, lines: list[tuple[str, ImageFont.ImageFont, tuple[int, int, int]]]) -> None:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, W, 8], fill=TEAL)
    draw.rectangle([0, H - 8, W, H], fill=TEAL)
    draw_centered(draw, lines)
    img.save(path)


def caption_overlay(text: str, path: Path) -> None:
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    fnt = font(32, bold=True)
    bbox = draw.textbbox((0, 0), text, font=fnt)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = 16
    bar_h = th + pad * 2
    y0 = H - bar_h - 40
    draw.rounded_rectangle([40, y0, W - 40, y0 + bar_h], radius=12, fill=(0, 0, 0, 220))
    draw.text(((W - tw) // 2, y0 + pad - 2), text, font=fnt, fill=(*WHITE, 255))
    overlay.save(path)


def native_on_black(src_path: Path, out_path: Path) -> None:
    """Never upscale small UI crops — center at native size on black."""
    src = Image.open(src_path).convert("RGBA")
    nw, nh = src.width, src.height
    if nw > W or nh > H:
        scale = min(W / nw, H / nh)
        nw, nh = int(nw * scale), int(nh * scale)
        src = src.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (W, H), BG)
    canvas.paste(src, ((W - nw) // 2, (H - nh) // 2), src)
    canvas.save(out_path)


def pick_encoder() -> str:
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-encoders"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    if "libx264" in out:
        return "libx264"
    if "libopenh264" in out:
        return "libopenh264"
    raise SystemExit("No H.264 encoder (need libx264 or libopenh264)")


def build_cards() -> None:
    title_f = font(64, True)
    sub_f = font(40, True)
    body_f = font(34)
    small_f = font(28)

    black_card(
        HERE / "title-05s.png",
        [
            ("PR Readiness Coach", title_f, WHITE),
            ("Day 1 — Docs Sync Check", sub_f, ACCENT),
            ("Kiro Birthday 2026", body_f, MUTED),
            ("https://github.com/jajera/pr-readiness-coach", small_f, MUTED),
        ],
    )
    black_card(
        HERE / "expect-01-hooks.png",
        [
            ("Next", small_f, MUTED),
            ("Agent Hooks panel", title_f, WHITE),
            ("Expect: Docs Sync Check enabled", body_f, ACCENT),
            ("among five configured hooks", body_f, MUTED),
        ],
    )
    black_card(
        HERE / "expect-02-src.png",
        [
            ("Next", small_f, MUTED),
            ("Save a TypeScript file under src/", title_f, WHITE),
            ("Expect: Docs Sync Check fires", body_f, ACCENT),
            ("Drift Report — or “no updates needed”", body_f, MUTED),
            ("PR Readiness Coach may also fire (OK)", small_f, MUTED),
        ],
    )
    black_card(
        HERE / "expect-03-ready.png",
        [
            ("Next", small_f, MUTED),
            ("Save ready.yml", title_f, WHITE),
            ("Expect: Docs Sync Check fires", body_f, ACCENT),
            ("PR Readiness Coach does not fire", body_f, MUTED),
        ],
    )
    black_card(
        HERE / "expect-04-scope.png",
        [
            ("Next", small_f, MUTED),
            ("Scope note", title_f, WHITE),
            ("Does not fire on web/ or docs/ edits", body_f, ACCENT),
            ("src/ TS may also run PR Readiness Coach", body_f, MUTED),
        ],
    )
    black_card(
        HERE / "end-05s.png",
        [
            ("Built with Kiro", title_f, WHITE),
            ("specs · hooks · agent workflow", body_f, ACCENT),
            ("https://github.com/jajera/pr-readiness-coach", small_f, MUTED),
            ("#BuildWithKiro  #TeamKiro  @kirodotdev", body_f, WHITE),
        ],
    )
    caption_overlay("Docs Sync Check firing on src/ save", HERE / "caption-03.png")
    caption_overlay("Docs Sync Check on ready.yml — not PR Coach", HERE / "caption-04.png")
    native_on_black(SRC_HOOKS, HERE / "02-hooks-panel-slide.png")


def run_ffmpeg(encoder: str) -> None:
    for required in (SRC_HOOKS, SRC_LIVE_03, SRC_LIVE_04):
        if not required.exists():
            raise SystemExit(f"Missing source capture: {required.name}")

    cmd = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-t",
        str(CARD_SECS),
        "-i",
        "title-05s.png",
        "-loop",
        "1",
        "-t",
        str(CARD_SECS),
        "-i",
        "expect-01-hooks.png",
        "-loop",
        "1",
        "-t",
        str(CARD_SECS),
        "-i",
        "02-hooks-panel-slide.png",
        "-loop",
        "1",
        "-t",
        str(CARD_SECS),
        "-i",
        "expect-02-src.png",
        "-i",
        SRC_LIVE_03.name,
        "-i",
        "caption-03.png",
        "-loop",
        "1",
        "-t",
        str(CARD_SECS),
        "-i",
        "expect-03-ready.png",
        "-i",
        SRC_LIVE_04.name,
        "-i",
        "caption-04.png",
        "-loop",
        "1",
        "-t",
        str(CARD_SECS),
        "-i",
        "expect-04-scope.png",
        "-loop",
        "1",
        "-t",
        str(CARD_SECS),
        "-i",
        "end-05s.png",
        "-filter_complex",
        (
            "[0:v]scale=1440:1080,setsar=1,fps=30,format=yuv420p[v0];"
            "[1:v]scale=1440:1080,setsar=1,fps=30,format=yuv420p[v1];"
            "[2:v]scale=1440:1080,setsar=1,fps=30,format=yuv420p[v2];"
            "[3:v]scale=1440:1080,setsar=1,fps=30,format=yuv420p[v3];"
            "[4:v]scale=1440:1080:force_original_aspect_ratio=decrease,"
            "pad=1440:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=rgba[v4b];"
            "[5:v]scale=1440:1080,format=rgba[c3];"
            "[v4b][c3]overlay=0:0,format=yuv420p[v4];"
            "[6:v]scale=1440:1080,setsar=1,fps=30,format=yuv420p[v6];"
            "[7:v]scale=1440:1080:force_original_aspect_ratio=decrease,"
            "pad=1440:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=rgba[v7b];"
            "[8:v]scale=1440:1080,format=rgba[c4];"
            "[v7b][c4]overlay=0:0,format=yuv420p[v7];"
            "[9:v]scale=1440:1080,setsar=1,fps=30,format=yuv420p[v9];"
            "[10:v]scale=1440:1080,setsar=1,fps=30,format=yuv420p[v10];"
            "[v0][v1][v2][v3][v4][v6][v7][v9][v10]concat=n=9:v=1:a=0[outv]"
        ),
        "-map",
        "[outv]",
        "-an",
        "-c:v",
        encoder,
        "-b:v",
        "2500k",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        OUT.name,
    ]
    if encoder == "libx264":
        # insert after -c:v libx264
        i = cmd.index("libx264")
        cmd[i + 1 : i + 1] = ["-preset", "medium", "-crf", "20"]
        # remove -b:v when using crf
        bi = cmd.index("-b:v")
        del cmd[bi : bi + 2]

    print("Running:", " ".join(cmd[:8]), "...")
    subprocess.run(cmd, cwd=HERE, check=True)
    print(f"Wrote {OUT}")


def main() -> None:
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg not found on PATH")
    encoder = pick_encoder()
    print(f"Using encoder: {encoder}")
    build_cards()
    run_ffmpeg(encoder)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)
