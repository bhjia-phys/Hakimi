import web from '../../../vite.config';

export default {
  ...web,
  root: import.meta.dirname,
  server: { host: '127.0.0.1', port: 5193, strictPort: true },
};
