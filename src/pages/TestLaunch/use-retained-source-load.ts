import {useCallback,useEffect,useRef} from 'react';

/** Retain the current source result during wizard navigation, without persisting inputs. */
export function useRetainedSourceLoad<T>(options:{
 contextKey:string; active:boolean; load:()=>Promise<T>;
 onStart:()=>void; onSuccess:(result:T)=>void; onError:(error:unknown)=>void;
 onFinish:()=>void; onReset:()=>void;
}) {
 const latest=useRef(options);
 latest.current=options;
 const context=useRef<string|null>(null);
 const request=useRef<object|null>(null);
 const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
 const run=useCallback((force=false)=>{
  const current=latest.current;
  if(!current.active||(!force&&request.current)) return;
  const token={};
  request.current=token;
  const key=current.contextKey;
  const isCurrent=()=>mounted.current&&request.current===token&&latest.current.contextKey===key;
  current.onStart();
  Promise.resolve().then(current.load).then(result=>{
   if(isCurrent()) latest.current.onSuccess(result);
  }).catch(error=>{
   if(isCurrent()) latest.current.onError(error);
  }).finally(()=>{
   if(isCurrent()) latest.current.onFinish();
  });
 },[]);
 useEffect(()=>{
  if(context.current!==options.contextKey) {
   const previous=context.current;
   context.current=options.contextKey;
   request.current=null;
   if(previous!==null) latest.current.onReset();
  }
  if(options.active) run();
 },[options.contextKey,options.active,run]);
 return {retry:useCallback(()=>run(true),[run])};
}
