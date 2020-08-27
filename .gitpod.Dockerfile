FROM gitpod/workspace-full

# Install custom tools, runtime, etc.
RUN sudo apt-get update \
    && sudo apt-get install -y openssh-server \
    && sudo rm -rf /var/lib/apt/lists/* \
    && sudo useradd -m -p `openssl passwd -1 vagrant` vagrant
