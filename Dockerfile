ARG NGINX_IMAGE=nginx:1.29-alpine
FROM ${NGINX_IMAGE}
ARG DOCS_BASE_URL=/
RUN rm -rf /usr/share/nginx/html && mkdir -p /usr/share/nginx/html
RUN sed -i '/^server {/a\    absolute_redirect off;' /etc/nginx/conf.d/default.conf
COPY build/ /usr/share/nginx/html${DOCS_BASE_URL}
RUN chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
