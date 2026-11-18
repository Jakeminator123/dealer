# Dealer-körare för MuseTalk 1.5 med versionerad upstream-kod och inläggning.
# Vikterna monteras på /modeller (se README.md).
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 \
    HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 OMP_NUM_THREADS=4 \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility NVIDIA_VISIBLE_DEVICES=all
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv ffmpeg git ca-certificates libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*
COPY docker/requirements.txt /tmp/requirements.txt
# torch 2.8.0 från PyPI är byggd mot CUDA 12.8.
ENV PIP_RETRIES=10 PIP_DEFAULT_TIMEOUT=120
RUN python3 -m venv /venv && /venv/bin/pip install --upgrade pip==25.2 && \
    /venv/bin/pip install torch==2.8.0 torchvision==0.23.0
RUN /venv/bin/pip install -r /tmp/requirements.txt && \
    /venv/bin/pip install --no-deps mediapipe==0.10.31 absl-py==2.3.1 flatbuffers==25.9.23 sounddevice==0.5.3
# pip check godkänner allt utom MediaPipe-hjulets plattformsetikett (py3-none-manylinux_2_28); importen prövas i stället.
RUN (/venv/bin/pip check || true) | grep -v '^mediapipe 0.10.31 is not supported on this platform$' > /tmp/pipcheck; \
    cat /tmp/pipcheck; test ! -s /tmp/pipcheck || test "$(cat /tmp/pipcheck)" = "No broken requirements found." || exit 1; \
    rm /tmp/pipcheck && /venv/bin/python -c 'import mediapipe, cv2, diffusers, transformers, librosa, torch; from mediapipe.tasks.python import vision; print("import ok", mediapipe.__version__, torch.__version__, torch.version.cuda)'
ARG MUSETALK_COMMIT=0a89dec45a0192b824e3cf4daf96c239440c5ed8
RUN mkdir -p /opt/MuseTalk && cd /opt/MuseTalk && git init -q && \
    git fetch -q --depth 1 https://github.com/TMElyralab/MuseTalk.git ${MUSETALK_COMMIT} && \
    git checkout -q FETCH_HEAD && test "$(git rev-parse HEAD)" = "${MUSETALK_COMMIT}" && \
    rm -rf .git assets data && echo "${MUSETALK_COMMIT}" > /opt/MuseTalk/COMMIT
COPY kod/ /opt/korare/
COPY licenses/ /opt/korare/licenses/
COPY LICENSER.md /opt/korare/LICENSER.md
ENV PYTHONPATH=/opt/MuseTalk:/opt/korare MUSETALK_DIR=/opt/MuseTalk MODELLER=/modeller
WORKDIR /opt/korare
ENTRYPOINT ["/venv/bin/python", "/opt/korare/korare.py"]
