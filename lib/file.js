/**
 * @param {string} path 
 * @returns {string} The uri
 */
function pathToShareUri(path) {
  return path.replace('/share/', 'share://');
}

/**
 * @param {string} uri 
 * @returns {string} The path
 */
function shareUriToPath(uri) {
  return uri.replace('share://', '/share/');
}

export {
  pathToShareUri,
  shareUriToPath,
}