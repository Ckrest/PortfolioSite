/** Publication policy shared by the source build and unit tests. */
export function isDiscoverableUpdate(update) {
  return (update?.discovery || 'listed') === 'listed';
}
