"""Generate bundled neural speech from public example texts; no runtime TTS dependency.

Install build tools in .tools/voice: edge-tts==7.2.8 mutagen==1.48.1.
Run from the project root with .tools/voice/Scripts/python.exe.
Only catalog texts are sent to Microsoft; never send user lessons/materials here.
"""
import asyncio
import json
import os
import tempfile
from pathlib import Path

import edge_tts
from mutagen.mp3 import MP3

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "public/assets/audio"
VOICE = "es-MX-DaliaNeural"
RATE = "-8%"


async def main():
    catalog = json.loads((AUDIO / "catalog.json").read_text(encoding="utf-8"))
    voices = await edge_tts.list_voices()
    if not any(v["ShortName"] == VOICE for v in voices):
        raise RuntimeError(f"Voice unavailable: {VOICE}")
    # Generate and validate the complete set before replacing bundled audio.
    with tempfile.TemporaryDirectory(prefix="aprende-natural-") as stage:
        staged = []
        for clip in catalog["clips"]:
            target = Path(stage) / (clip["id"] + ".mp3")
            await edge_tts.Communicate(clip["text"], VOICE, rate=RATE).save(str(target))
            duration = MP3(target).info.length
            if not 0.2 < duration <= 120 or target.stat().st_size < 1000:
                raise RuntimeError(f"Invalid generated audio: {clip['id']}")
            clip.update(voice=VOICE, engine=f"edge-tts@{edge_tts.__version__}",
                        durationSeconds=round(duration, 2), bytes=target.stat().st_size,
                        qualityStatus="neural_synthetic_listening_review_pending", rate=RATE)
            staged.append((target, AUDIO / (clip["id"] + ".mp3")))
            print(f"Generated {clip['id']}: {duration:.2f}s", flush=True)
        for source, destination in staged:
            destination.write_bytes(source.read_bytes())
    catalog.update(language="es-MX", generation="neural_cloud_build_time_bundled_offline")
    temp = AUDIO / "catalog.json.tmp"
    temp.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, AUDIO / "catalog.json")
    print(f"Replaced {len(staged)} clips with {VOICE}")


if __name__ == "__main__":
    asyncio.run(main())
