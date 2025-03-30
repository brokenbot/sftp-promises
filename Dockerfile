FROM alpine:latest

RUN apk add --no-cache openssh-server bash

# Create test user with proper home directory
RUN adduser -h /home/vagrant -s /bin/bash -D vagrant && echo 'vagrant:vagrant' | chpasswd
RUN echo 'root:root' | chpasswd

# Create test directories and files
RUN mkdir -p /home/vagrant/test
RUN chown -R vagrant:vagrant /home/vagrant
RUN chmod -R 755 /home/vagrant

# Set up SSH server
RUN mkdir -p /var/run/sshd
RUN chmod 0755 /var/run/sshd

# Configure SSH to allow password authentication
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config
RUN sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
RUN echo "AllowUsers vagrant root" >> /etc/ssh/sshd_config

# Generate host keys
RUN ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key -N ''
RUN ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ''

# Ensure /tmp is writable
RUN chmod 1777 /tmp

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D"]
