# ==============================================================================
# Stage 1: Model Downloader
# ==============================================================================
FROM rust:1.97-slim as model-builder

WORKDIR /builder
# Install pkg-config, libssl-dev, and build-essential which are often required for Rust crypto/networking crates
RUN apt-get update && apt-get install -y pkg-config libssl-dev build-essential && rm -rf /var/lib/apt/lists/*

# Create a dummy Cargo project
RUN cargo new model-downloader
WORKDIR /builder/model-downloader
# Add face_id and tokio
RUN cargo add face_id@0.4 && cargo add tokio -F rt-multi-thread

# Write a minimal script to trigger the FaceAnalyzer model download from Hugging Face
RUN echo 'fn main() {\n\
    println!("Downloading models...");\n\
    tokio::runtime::Builder::new_current_thread()\n\
        .enable_all()\n\
        .build()\n\
        .unwrap()\n\
        .block_on(async {\n\
            face_id::analyzer::FaceAnalyzer::from_hf().build().await.expect("Failed to build face analyzer and download models");\n\
        });\n\
    println!("Done downloading models.");\n\
}' > src/main.rs

# Build and run the script to download and cache the models to /root/.cache/huggingface/hub
RUN cargo run --release

# ==============================================================================
# Stage 2: Final Runtime Image
# ==============================================================================
FROM debian:trixie-slim

WORKDIR /app

# Install necessary runtime dependencies (ca-certificates for HTTPS/AWS, libssl for crypto)
# Force IPv4 because Docker's IPv6 routing often drops packets and hangs apt-get
RUN echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4 && \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates libssl3 libstdc++6 curl && \
    rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from your host's target directory
COPY target/release/attendance-geotag-backend /usr/local/bin/

# Create an unprivileged user
RUN useradd -m appuser && chown -R appuser:appuser /app

# Copy the downloaded Hugging Face model cache from the builder stage
# We place it in appuser's home directory so FaceAnalyzer finds it in ~/.cache/huggingface
COPY --from=model-builder --chown=appuser:appuser /root/.cache /home/appuser/.cache

USER appuser

# Default port
EXPOSE 3000

# Start the application
CMD ["attendance-geotag-backend"]
