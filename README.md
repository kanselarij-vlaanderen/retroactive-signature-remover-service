# Retroactive signature remover

A small-ish utility service for the Kaleidos app to strip older files that were uploaded with a digital signature.

The main goal of this service is to provide a service endpoint for administrators with SSH access to Kaleidos to go over the documents in Kaleidos and strip any document that was (erroneously) uploaded with a digital signature.
Additionally, this service exposes a number of utility endpoints that can be used to gather data about the signed pieces in Kaleidos.

## Adding it to Kaleidos

Add the following to the `docker-compose.override.yml` file:
```yml
retroactive-signature-remover:
  image: kanselarij/retroactive-signature-remover-service:latest
  volumes:
    - ./data/files:/share
    - ./data/rsr-cache:/cache
```

Run the following command to start the process of stripping the signed files:
```bash
drc exec retroactive-signature-remover curl -XPOST http://localhost/strip-all-pieces
# You can follow up the progress with the following logs:
drc logs -f retroactive-signature-remover pdf-flattener pdf-signature-remover
```

## Design

At its core, the service is very simple. All it does is iterate over the pieces in Kaleidos and check whether the "main piece" is signed. If so, the piece is re-inserted into the database (by re-adding the triple `<piece-uri> a dossier:Stuk`) which triggers the deltas that will strip and flatten the piece.

Because Kaleidos contains very many pieces, the process of enumerating all of them can take a long time. To alleviate this a bit, the service fetches the files from the database in batches using "keyset pagination" on the piece's creation time. We fetch 100 pieces ordered by creation date, when fetching the next batch we put a filter on the creation date stating that it must be greater than the last creation date we have from the previous batch. Paginating like this proves to be a lot faster than paginating using `OFFSET` in Virtuoso.

Additionally, the pieces that are fetched are constrained by two timestamps: they must've been created between `2019-10-02` (when Kaleidos started being used) and `2024-04-12` (when the pdf-signature-remover started being used in Kaleidos). These dates are hardcoded in the code of the service, they can be changed are extracted into environment variables if it's deemed necessary to perform this operation on a larger date range.

Though mostly for debugging purposes, this service makes use of a "service cache" (read: a file on disk) to store the pieces that get fetched as well as the physical URIs of the files that are signed. This was implemented this way to limit the amount of times the pieces and files need to be computed. The service internally uses the `/cache` folder to store these files, generally I've been using `./data/rsr-cache` as the mount for said folder.

## Endpoints

- `/`: Fetches all the pertinent pieces and checks which are signed. A message is returned with the number of signed files found. The piece- and file URIs are stored in the cache folder (respectively: `/cache/pieces`, `/cache/signed-uris`)
- `/piece-url/:physicalUri`: from a file's physical URI (so something that looks like `share://xxxx`), get the URL that resolves to the document viewer on Kaleidos (by default, the TEST environment). This is useful for debugging purposes for a single file, so you can go and check the file on Kaleidos
- `/strip-piece/:physicalUri`: this endpoint starts the process of stripping a single file (by re-insterting the `<piece-uri> a dossier:Stuk` triple) based off of a file's physical URI. Mostly for testing purposes
- `/signed-uris-csv`: this endpoint will respond with plaintext output of a CSV containing two columns: `physicalUri` and `kaleidosUrl`. This is also for debugging purposes, mostly to have a full list of signed files and their respective URL to the document viewer
- `/strip-all-pieces`: the meat and potatoes of the service: it gets all the files and pieces and triggers them to start getting stripped.

All of the endpoints should make use of the internal cache. If the cache is empty when an operation is started, it will first be filled. The cache isn't cleared by the service, if you want to clear it you should delete the files in the cache folder.