import type { SourceId } from './journey';

export interface Source {
  /** Short label shown next to a trace step. */
  short: string;
  authors: string;
  title: string;
  publisher: string;
  url: string;
  /** What the exhibit takes from it. */
  use: string;
}

export const SOURCES: Record<SourceId, Source> = {
  rfc1034: {
    short: 'RFC 1034',
    authors: 'P. Mockapetris',
    title: 'Domain Names — Concepts and Facilities',
    publisher: 'IETF, November 1987',
    url: 'https://www.rfc-editor.org/rfc/rfc1034',
    use: 'Resolvers, name servers, caching and TTLs.',
  },
  rfc9293: {
    short: 'RFC 9293',
    authors: 'W. Eddy (ed.)',
    title: 'Transmission Control Protocol (TCP)',
    publisher: 'IETF, August 2022',
    url: 'https://www.rfc-editor.org/rfc/rfc9293',
    use: 'The three-way handshake.',
  },
  rfc8446: {
    short: 'RFC 8446',
    authors: 'E. Rescorla',
    title: 'The Transport Layer Security (TLS) Protocol Version 1.3',
    publisher: 'IETF, August 2018',
    url: 'https://www.rfc-editor.org/rfc/rfc8446',
    use: 'The one-round-trip handshake, PSK resumption, 0-RTT early data and its replay caveat.',
  },
  rfc9110: {
    short: 'RFC 9110',
    authors: 'R. Fielding, M. Nottingham and J. Reschke (eds.)',
    title: 'HTTP Semantics',
    publisher: 'IETF, June 2022',
    url: 'https://www.rfc-editor.org/rfc/rfc9110',
    use: 'Methods, status codes (200, 304), ETag and If-None-Match, shared by every HTTP version.',
  },
  rfc9111: {
    short: 'RFC 9111',
    authors: 'R. Fielding, M. Nottingham and J. Reschke (eds.)',
    title: 'HTTP Caching',
    publisher: 'IETF, June 2022',
    url: 'https://www.rfc-editor.org/rfc/rfc9111',
    use: 'Freshness, max-age and revalidation of stored responses.',
  },
  rfc9000: {
    short: 'RFC 9000',
    authors: 'J. Iyengar and M. Thomson (eds.)',
    title: 'QUIC: A UDP-Based Multiplexed and Secure Transport',
    publisher: 'IETF, May 2021',
    url: 'https://www.rfc-editor.org/rfc/rfc9000',
    use: 'Combined transport and cryptographic handshake.',
  },
  rfc9114: {
    short: 'RFC 9114',
    authors: 'M. Bishop (ed.)',
    title: 'HTTP/3',
    publisher: 'IETF, June 2022',
    url: 'https://www.rfc-editor.org/rfc/rfc9114',
    use: 'HTTP semantics mapped onto QUIC streams.',
  },
  'spring-mvc': {
    short: 'Spring Web MVC',
    authors: 'Spring Framework reference documentation',
    title: 'Web on Servlet Stack: Spring Web MVC',
    publisher: 'spring.io, current version',
    url: 'https://docs.spring.io/spring-framework/reference/web/webmvc.html',
    use: 'Front-controller dispatch, handler mappings, @GetMapping controllers, HTTP message converters and ShallowEtagHeaderFilter.',
  },
  'spring-cache': {
    short: 'Spring cache abstraction',
    authors: 'Spring Framework reference documentation',
    title: 'Cache Abstraction',
    publisher: 'spring.io, current version',
    url: 'https://docs.spring.io/spring-framework/reference/integration/cache.html',
    use: '@Cacheable: look up the key first, run the method only on a miss.',
  },
  'spring-data': {
    short: 'Spring Data JPA',
    authors: 'Spring Data JPA reference documentation',
    title: 'JPA Repositories',
    publisher: 'spring.io, current version',
    url: 'https://docs.spring.io/spring-data/jpa/reference/',
    use: 'Repository interfaces that issue SQL through a pooled JDBC connection.',
  },
};

/** Display order in the Sources section. */
export const SOURCE_ORDER: SourceId[] = [
  'rfc1034',
  'rfc9293',
  'rfc8446',
  'rfc9110',
  'rfc9111',
  'rfc9000',
  'rfc9114',
  'spring-mvc',
  'spring-cache',
  'spring-data',
];
