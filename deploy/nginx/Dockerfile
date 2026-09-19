FROM nginx:1.29-alpine

RUN rm -f /etc/nginx/conf.d/default.conf && mkdir -p /var/www/certbot /var/www/site
COPY nginx.conf /etc/nginx/nginx.conf
COPY snippets/ /etc/nginx/snippets/
COPY sites/ /etc/nginx/sites/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80 443
ENTRYPOINT ["/entrypoint.sh"]
