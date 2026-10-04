import koffi from 'koffi';
export const nativeFFI=koffi;
export function windowsObserver(){
  if(process.platform!=='win32')return ()=>null;
  try {
    const user=koffi.load('user32.dll'),kernel=koffi.load('kernel32.dll');
    const rect=koffi.struct('CompanionRect',{left:'int32',top:'int32',right:'int32',bottom:'int32'});
    const get=user.func('void * __stdcall GetForegroundWindow()');
    const bounds=user.func('bool __stdcall GetWindowRect(void *, _Out_ CompanionRect *)');
    const title=user.func('int __stdcall GetWindowTextW(void *, _Out_ uint16_t *, int)');
    const pid=user.func('uint32 __stdcall GetWindowThreadProcessId(void *, _Out_ uint32_t *)');
    const open=kernel.func('void * __stdcall OpenProcess(uint32, bool, uint32)');
    const query=kernel.func('bool __stdcall QueryFullProcessImageNameW(void *, uint32, _Out_ uint16_t *, _Inout_ uint32_t *)');
    const close=kernel.func('bool __stdcall CloseHandle(void *)');
    return (readTitles=false)=>{
      const h=get();if(!h)return null;const text=new Uint16Array(1024);if(readTitles)title(h,text,text.length);
      const r:any={};bounds(h,r);const p=new Uint32Array(1);pid(h,p);let executable='';
      const proc=open(0x1000,false,p[0]);if(proc){try{const b=new Uint16Array(1024),n=new Uint32Array([1024]);if(query(proc,0,b,n))executable=Buffer.from(b.buffer).toString('utf16le').replace(/\0.*$/s,'').split('\\').at(-1)??'';}finally{close(proc);}}
      return {title:Buffer.from(text.buffer).toString('utf16le').replace(/\0.*$/s,''),app:executable,rect:r,pid:p[0]};
    };
  }catch{return ()=>null;}
}
