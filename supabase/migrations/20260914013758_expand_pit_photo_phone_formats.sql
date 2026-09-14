-- Keep the private pit-photo bucket compatible with the image formats exposed by
-- mobile photo pickers. Access policies and the existing 10 MB size limit stay intact.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/gif'
]
where id = 'pit-photos';
