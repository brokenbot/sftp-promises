FROM alpine:latest

RUN apk add --no-cache openssh-server bash
RUN adduser -h /home/vagrant -s /bin/bash -D vagrant && echo 'vagrant:vagrant' | chpasswd
RUN echo 'root:root' | chpasswd

RUN mkdir -p /var/run/sshd
RUN chmod 0755 /var/run/sshd

# Configure SSH to allow password authentication
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config
RUN sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
RUN echo "AllowUsers vagrant root" >> /etc/ssh/sshd_config

RUN ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key -N ''
RUN ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ''

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D"]
