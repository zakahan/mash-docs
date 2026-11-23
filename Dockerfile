ARG NGINX_IMAGE=nginx:1.29-alpine
FROM ${NGINX_IMAGE}
ARG DOCS_BASE_URL=/
RUN rm -rf /usr/share/nginx/html && mkdir -p /usr/share/nginx/html
COPY build/ /usr/share/nginx/html${DOCS_BASE_URL}
RUN chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
