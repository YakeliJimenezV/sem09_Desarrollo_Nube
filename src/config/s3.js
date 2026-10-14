
const { S3Client } = require('@aws-sdk/client-s3');
const { fromIni } = require('@aws-sdk/credential-providers');

const region = process.env.AWS_REGION || 'us-east-1';
const bucket = process.env.AWS_S3_BUCKET;
const profile = process.env.AWS_PROFILE || 'app-user';

if (!bucket) {
  throw new Error('Falta configurar AWS_S3_BUCKET en .env');
}

const s3 = new S3Client({
  region,
  credentials: fromIni({ profile }),
});

module.exports = { s3, bucket, region };
