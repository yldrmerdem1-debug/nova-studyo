// Short local editor operations share exclusion with the production queue.
const editing=new Set();
export const isJobEditing=id=>editing.has(id);
export function beginJobEdit(id) {
  if(editing.has(id)) throw Object.assign(new Error('Bu işin düzenleme işlemi sürüyor; tamamlanmasını bekleyin.'),{statusCode:409});
  editing.add(id);
  return ()=>editing.delete(id);
}
