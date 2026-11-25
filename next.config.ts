import type {NextConfig} from 'next';

const config:NextConfig={
  outputFileTracingIncludes:{
    '/api/**':['./lib/questions.txt','./lib/reserved.txt']
  }
};

export default config;

