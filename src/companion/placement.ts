type Rect={x:number;y:number;width:number;height:number};
export function quickPlacement(pet:Rect,area:Rect,width=360,height=190){
  width=Math.min(width,area.width);height=Math.min(height,area.height);
  const right=area.x+area.width,bottom=area.y+area.height,gap=10;
  const y=Math.max(area.y,Math.min(pet.y+Math.round(pet.height*.15),bottom-height));
  if(right-pet.x-pet.width>=width+gap)return {x:pet.x+pet.width+gap,y,width,height};
  if(pet.x-area.x>=width+gap)return {x:pet.x-width-gap,y,width,height};
  const x=Math.max(area.x,Math.min(pet.x+(pet.width-width)/2,right-width));
  if(bottom-pet.y-pet.height>=height+gap)return {x:Math.round(x),y:pet.y+pet.height+gap,width,height};
  if(pet.y-area.y>=height+gap)return {x:Math.round(x),y:pet.y-height-gap,width,height};
  return {x:pet.x-area.x>right-pet.x-pet.width?area.x:right-width,y,width,height};
}
