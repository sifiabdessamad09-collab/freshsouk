import {fault} from './auth.mjs';
import {statement} from './domain.mjs';
export const ZONES=['Casablanca','Bouskoura','Mohammedia'];
export async function shippingSettings(env){
 if(env.ADMIN_V2_ENABLED!=='true')return {version:0,deliveryFeeCents:2000,freeThresholdCents:20000,zones:['Casablanca']};
 let row;try{row=await statement(env,'SELECT * FROM admin_settings WHERE id=1').first();}catch{throw fault(503,'Migration Admin V2 requise.');}
 let zones;try{zones=JSON.parse(row?.zones);}catch{}
 if(!row||!Array.isArray(zones)||!zones.length||zones.some(z=>!ZONES.includes(z)))throw fault(503,'Configuration de livraison invalide.');
 return {version:row.version,deliveryFeeCents:row.delivery_fee_cents,freeThresholdCents:row.free_threshold_cents,zones};
}
