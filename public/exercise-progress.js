// Only use the child's currently assigned exercises and their current revisions.
export function exerciseProgress(activities,attempts,childId,currentId){
 const exercises=activities.filter(a=>a.cloud).map(activity=>{
  const history=attempts.filter(a=>a.childId===childId&&a.activityId===activity.id&&a.activityRevision===(activity.revision||1));
  const achieved=history.some(a=>a.score===10);
  return {id:activity.id,title:activity.title,current:activity.id===currentId,status:achieved?'achieved':history.length?'practiced':'pending',attempts:history.length};
 });
 const index=exercises.findIndex(a=>a.current);
 return {exercises,index,achieved:exercises.filter(a=>a.status==='achieved').length,practiced:exercises.filter(a=>a.status!=='pending').length,nextId:exercises[index+1]?.id||null,previousId:exercises[index-1]?.id||null};
}
