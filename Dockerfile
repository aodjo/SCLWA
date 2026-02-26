FROM gcc:latest

WORKDIR /code

RUN apt-get update && apt-get install -y coreutils && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash runner
USER runner

CMD ["bash"]
