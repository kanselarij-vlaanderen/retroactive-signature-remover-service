import { update, query, sparqlEscapeUri } from 'mu';

const KALEIDOS_BASE_URL = 'https://kaleidos-test.vlaanderen.be/document/';

async function getPieceUrlFromFile(physicalUri) {
  const queryString = `
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

SELECT DISTINCT ?url
WHERE {
  GRAPH <http://mu.semte.ch/graphs/organizations/kanselarij> {
    ${sparqlEscapeUri(physicalUri)} nie:dataSource ?file .
    ?piece prov:value ?file ; mu:uuid ?id .

    BIND(CONCAT("${KALEIDOS_BASE_URL}", STR(?id)) AS ?url)
  }
}`;

  const response = await query(queryString, { sudo: true });

  if (!response?.results?.bindings?.length) {
    return null;
  }

  const bindings = response.results.bindings;
  return bindings[0]['url']['value'];
}

async function getPieceUriFromFile(physicalUri) {
  const queryString = `
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

SELECT DISTINCT ?piece
WHERE {
  GRAPH <http://mu.semte.ch/graphs/organizations/kanselarij> {
    ${sparqlEscapeUri(physicalUri)} nie:dataSource ?file .
    ?piece prov:value ?file .
  }
}`;

  const response = await query(queryString, { sudo: true });

  if (!response?.results?.bindings?.length) {
    return null;
  }

  const bindings = response.results.bindings;
  return bindings[0]['piece']['value'];
}

async function reinsertPiece(pieceUri) {
  const queryString = `
PREFIX dossier: <https://data.omgeving.vlaanderen.be/ns/dossier#>

INSERT DATA {
  GRAPH <http://mu.semte.ch/graphs/organizations/kanselarij> {
    ${sparqlEscapeUri(pieceUri)} a dossier:Stuk .
  }
}`;

  await update(queryString, { sudo: true });
}

export {
  getPieceUrlFromFile,
  getPieceUriFromFile,
  reinsertPiece,
}