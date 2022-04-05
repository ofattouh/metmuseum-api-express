// Validate the search form

function validateSearchForm () {
  const departmentId = $('#departmentId');
  const searchTerm = $('#searchTerm');

  if (departmentId.val() === '' || searchTerm.val() === '') {
    alert('Department ID and search terms are required fields!');
    return false;
  }

  return true;
}
