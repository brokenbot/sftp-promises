FROM alpine:latest

RUN apk add --no-cache openssh-server 
RUN adduser -h /home/vagrant -s /bin/bash -D vagrant && echo 'vagrant:vagrant' | chpasswd
RUN echo 'root:root' | chpasswd

RUN mkdir -p /var/run/sshd
RUN chmod 0755 /var/run/sshd

RUN ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key -N ''
RUN ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ''

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D"]
