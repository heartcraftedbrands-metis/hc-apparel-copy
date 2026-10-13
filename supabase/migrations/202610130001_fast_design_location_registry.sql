-- Versioned production-placement registry transcribed from the authenticated
-- FAST Design Location Guide for Heart Crafted Apparel LLC on 2026-10-13.
-- Provider names, numeric IDs, source evidence, and raw notes stay private.

create table if not exists public.design_location_definitions (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  provider_location_id integer not null,
  definition_version text not null,
  view_side text not null check (view_side in ('front','back')),
  provider_name text not null,
  customer_label text not null,
  provider_category text not null,
  customer_group text not null default 'Other' check (customer_group in ('Front','Back','Chest','Sleeves','Other')),
  surface_key text check (surface_key in ('front','back','left_chest','right_chest','left_sleeve','right_sleeve')),
  width_in numeric(7,3),
  height_in numeric(7,3),
  dimension_mode text not null default 'fixed' check (dimension_mode in ('fixed','vector','custom')),
  units text not null default 'inches' check (units = 'inches'),
  anchor_key text,
  placement_instructions text,
  proof_required boolean not null default false,
  custom_instructions_required boolean not null default false,
  studio_enabled boolean not null default false,
  applicable_garment_types text[] not null default '{}'::text[],
  applicable_audiences text[] not null default '{}'::text[],
  applicable_methods text[] not null default '{}'::text[],
  verified boolean not null default true,
  source_kind text not null,
  source_reference text not null,
  source_retrieved_at timestamptz not null,
  raw_source jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_key, provider_location_id, definition_version)
);

alter table public.design_location_definitions enable row level security;
drop policy if exists design_location_definitions_admin_all on public.design_location_definitions;
create policy design_location_definitions_admin_all on public.design_location_definitions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.design_location_definitions to service_role;
grant select, insert, update, delete on public.design_location_definitions to authenticated;

with source(side, provider_id, name, category, width_in, height_in, instructions) as (values
  ('front',34,'Above Left Pocket','Bottoms',3.5,3.5,'Centered 1 inch above the top edge of the pocket to the bottom edge of the design.'),
  ('front',91,'Above Right Pocket','Bottoms',3.5,3.5,'Centered 1 inch above the top edge of the pocket to the bottom edge of the design.'),
  ('front',36,'Across Chest','Tops',12,4,'Centered 2 inches down from the neck seam to the upper edge of the artwork.'),
  ('front',95,'All-Over Print (Front)','Tops',null,null,'Customer-specified placement; proof required.'),
  ('front',25,'Bag - Front Center','Accessories',10,10,'Centered horizontally and vertically on the bag. Dimensions vary by bag style.'),
  ('front',122,'Bag - Top Upper Lid','Accessories',5,5,'Centered within the panel, with the bottom of the design along the zipper.'),
  ('front',28,'Beanie - Front','Hats',3.5,3.5,'One inch up from the bottom edge of the beanie to the bottom edge of the design.'),
  ('front',120,'Beanie - Left Side','Hats',3.5,3.5,'One inch up from the bottom edge of the beanie to the bottom edge of the design on the wearer''s left.'),
  ('front',121,'Beanie - Right Side','Hats',3.5,3.5,'One inch up from the bottom edge of the beanie to the bottom edge of the design on the wearer''s right.'),
  ('front',39,'Beanie Fold - Front','Hats',3.5,2,'One inch up from the bottom edge of the fold to the bottom edge of the design.'),
  ('front',117,'Beanie Fold - Left Side','Hats',3.5,2,'One inch up from the bottom edge of the fold on the wearer''s left.'),
  ('front',118,'Beanie Fold - Right Side','Hats',3.5,2,'One inch up from the bottom edge of the fold on the wearer''s right.'),
  ('front',124,'Blanket - Left Corner','Accessories',4,4,'Blanket unfolded from the short side; design rotated 45 degrees and centered 4 inches from each edge at the left lower corner.'),
  ('front',125,'Blanket - Right Corner','Accessories',4,4,'Blanket unfolded from the short side; design rotated 45 degrees and centered 4 inches from each edge at the right lower corner.'),
  ('front',101,'Cap - Left Panel','Hats',5,2.5,'Start 0.5 inch from the brim seam and 0.5 inch from the left side seam; observe panel-width limits.'),
  ('front',102,'Cap - Right Panel','Hats',5,2.5,'Start 0.5 inch from the brim seam and 0.5 inch from the right side seam; observe panel-width limits.'),
  ('front',6,'Cap Front','Hats',4,2.4,'Centered on the cap front, 0.75 inch from the bill seam.'),
  ('front',45,'Cap Side Left','Hats',3,1.75,'Centered on the wearer''s left, 0.75 inch up from the bottom edge.'),
  ('front',43,'Cap Side Right','Hats',3,1.75,'Centered on the wearer''s right, 0.75 inch up from the bottom edge.'),
  ('front',46,'Center Chest','Tops',6,6,'Centered 2 inches down from the neck seam to the upper edge of the artwork.'),
  ('front',47,'Center Left','Tops',4,4,'Customer-specified placement; proof required.'),
  ('front',48,'Center Right','Tops',4,4,'Customer-specified placement; proof required.'),
  ('front',49,'Down Front Left','Tops',6,15,'7.5 inches down from the neck-and-shoulder seam intersection to the top edge of the design on the wearer''s left.'),
  ('front',50,'Down Front Right','Tops',6,15,'7.5 inches down from the neck-and-shoulder seam intersection to the top edge of the design on the wearer''s right.'),
  ('front',51,'Down Left Leg','Bottoms',3.5,15,'Customer-specified placement; proof required.'),
  ('front',52,'Down Left Sleeve','Sleeves',3.5,13,'Centered 3 inches down from the shoulder seam to the top edge of the design.'),
  ('front',53,'Down Right Leg','Bottoms',3.5,15,'Customer-specified placement; proof required.'),
  ('front',54,'Down Right Sleeve','Sleeves',3.5,13,'Centered 3 inches down from the shoulder seam to the top edge of the design.'),
  ('front',55,'Front Number','Tops',null,null,'Customer-specified placement; proof required.'),
  ('front',4,'Full Front - Adult','Tops',12,12,'Centered 2 inches down from the neck seam for crewnecks; 0.5 to 1 inch down from the center of a V-neck.'),
  ('front',99,'Full Front - Infant','Tops',5,5,'Centered 2 inches down from the neck seam to the upper edge of the artwork.'),
  ('front',97,'Full Front - Toddler','Tops',8,8,'Centered 2 inches down from the neck seam to the upper edge of the artwork.'),
  ('front',13,'Full Front - Youth','Tops',10,10,'Centered 2 inches down from the neck seam to the upper edge of the artwork.'),
  ('front',58,'Hoodie Full Front','Tops',12,9,'Centered 2 inches down from the neck seam to the upper edge of the artwork.'),
  ('front',60,'Hoodie On Pocket','Tops',4,4,'Centered horizontally and vertically on the hoodie pocket.'),
  ('front',61,'Inside Tag','Tops',null,null,'Five inches below the inside neck seam; required labels remain below the printed or sewn neck label.'),
  ('front',111,'Left Chest - Inner Jacket','Tops',3.5,3.5,'For a 3-in-1 inner jacket: 7.5 inches down from the neck-and-shoulder seam intersection to the center of the design on the wearer''s left.'),
  ('front',110,'Left Chest - Outer Jacket','Tops',3.5,3.5,'For a 3-in-1 outer jacket: 7.5 inches down from the neck-and-shoulder seam intersection to the center of the design on the wearer''s left.'),
  ('front',65,'Left Chest - Upper','Tops',3.5,3.5,'Centered between neck and sleeve seams, 5 inches down the shoulder seam to the center of the design on the wearer''s left.'),
  ('front',2,'Left Chest Position','Tops',3.5,3.5,'7.5 inches down from the neck-and-shoulder seam intersection to the center of the design on the wearer''s left.'),
  ('front',105,'Left Cuff','Tops',3,1.5,'Three inches up from the sleeve end to the bottom edge of the design on the wearer''s left arm.'),
  ('front',63,'Left Hip','Bottoms',4,4,'Customer-specified placement; proof required.'),
  ('front',103,'Left Leg Center','Bottoms',3.5,3.5,'4.5 inches from the bottom of the leg and 2.5 inches from the left side seam.'),
  ('front',64,'Left Leg Front','Bottoms',4,4,'Customer-specified placement; proof required.'),
  ('front',66,'Left Side Leg','Bottoms',4,4,'Customer-specified placement; proof required.'),
  ('front',67,'Left Side Wrap','Tops',13,13,'Customer-specified placement; proof required.'),
  ('front',30,'Left Sleeve','Sleeves',4,3.5,'Short sleeve: 1.5 inches up from the sleeve hem. Long sleeve: outer bicep 3 to 3.5 inches below the shoulder seam.'),
  ('front',69,'Low Across Front','Tops',13,4,'Centered 2 inches up from the shirt hem to the bottom edge of the artwork.'),
  ('front',73,'Lower Front Left','Tops',4,4,'Three inches up from the shirt hem to the bottom edge of the design on the wearer''s left.'),
  ('front',32,'Lower Front Right','Tops',4,4,'Three inches up from the shirt hem to the bottom edge of the design on the wearer''s right.'),
  ('front',75,'Lower Left Leg','Bottoms',4,4,'Customer-specified placement; proof required.'),
  ('front',76,'Lower Right Leg','Bottoms',4,4,'Customer-specified placement; proof required.'),
  ('front',92,'Mask Center','Masks',3,3,'Keep 0.5 inch from seams or pleats and center on the front.'),
  ('front',94,'Mask Left','Masks',3,3,'Keep 0.5 inch from seams or pleats and center on the wearer''s left.'),
  ('front',93,'Mask Right','Masks',3,3,'Keep 0.5 inch from seams or pleats and center on the wearer''s right.'),
  ('front',80,'On Left Pocket','Tops',3.5,3,'Centered horizontally and vertically on the wearer''s left shirt pocket.'),
  ('front',81,'On Right Pocket','Tops',3.5,3,'Centered horizontally and vertically on the wearer''s right shirt pocket.'),
  ('front',113,'Right Chest - Inner Jacket','Tops',3.5,3.5,'For a 3-in-1 inner jacket: 7.5 inches down from the neck-and-shoulder seam intersection to the center of the design on the wearer''s right.'),
  ('front',123,'Right Chest - Outer Jacket','Tops',3.5,3.5,'For a 3-in-1 outer jacket: 7.5 inches down from the neck-and-shoulder seam intersection to the center of the design on the wearer''s right.'),
  ('front',85,'Right Chest - Upper','Tops',3.5,3.5,'Centered between neck and sleeve seams, 5 inches down the shoulder seam to the center of the design on the wearer''s right.'),
  ('front',3,'Right Chest Position','Tops',3.5,3.5,'7.5 inches down from the neck-and-shoulder seam intersection to the center of the design on the wearer''s right.'),
  ('front',104,'Right Cuff','Tops',3,1.5,'Three inches up from the sleeve end to the bottom edge of the design on the wearer''s right arm.'),
  ('front',83,'Right Hip','Bottoms',4,4,'Customer-specified placement; proof required.'),
  ('front',84,'Right Leg Front','Bottoms',4,4,'Customer-specified placement; proof required.'),
  ('front',86,'Right Side Leg','Bottoms',4,4,'Customer-specified placement; proof required.'),
  ('front',87,'Right Side Wrap','Tops',13,13,'Customer-specified placement; proof required.'),
  ('front',31,'Right Sleeve','Sleeves',4,3.5,'Short sleeve: 1.5 inches up from the sleeve hem. Long sleeve: outer bicep 3 to 3.5 inches below the shoulder seam.'),
  ('front',29,'Scarf','Accessories',null,null,'Centered 1 inch up from the short-edge seam on the front face.'),
  ('front',33,'Towel Short Side Center','Accessories',null,null,'Centered 1 inch up from the short-edge seam on the front face.'),
  ('front',90,'Visor Front','Hats',4,1.5,'Centered on the visor front.'),
  ('front',15,'Custom Front','Custom',null,null,'Custom instructions and proof are required.'),
  ('back',108,'Above Left Back Pocket','Bottoms',4,2,'Bottom edge of the design 0.5 inch above the top of the pocket.'),
  ('back',109,'Above Right Back Pocket','Bottoms',4,2,'Bottom edge of the design 0.5 inch above the top of the pocket.'),
  ('back',35,'Across Back Seat','Bottoms',12,4,'Two inches down from the lower waist hem of trousers or shorts.'),
  ('back',77,'Across Shoulders','Tops',12,3,'Centered 2 inches below the back neck seam to the upper edge of the design.'),
  ('back',96,'All-Over Print (Back)','Tops',null,null,'Customer-specified placement; proof required.'),
  ('back',119,'Beanie - Back','Hats',3.5,3.5,'One inch up from the bottom edge; placed opposite the front design.'),
  ('back',116,'Beanie Fold - Back','Hats',3.5,2,'One inch up from the bottom edge of the fold; placed opposite the front design.'),
  ('back',7,'Cap Back','Hats',4,2.5,'Centered on the cap back, 0.75 inch up from the bottom edge.'),
  ('back',42,'Cap Back Arched','Hats',4,2.5,'Centered on the cap back, 0.5 inch up from the top edge of the size-strap opening.'),
  ('back',115,'Down Back Left','Tops',6,15,'7.5 inches down from the neck-and-shoulder seam intersection to the top edge of the design on the wearer''s left.'),
  ('back',114,'Down Back Right','Tops',6,15,'7.5 inches down from the neck-and-shoulder seam intersection to the top edge of the design on the wearer''s right.'),
  ('back',19,'Full Back - Adult','Tops',12,12,'Centered 3 inches below the back neck seam to the upper edge of the design.'),
  ('back',100,'Full Back - Infant','Tops',5,5,'Centered 3 inches below the back neck seam to the upper edge of the design.'),
  ('back',98,'Full Back - Toddler','Tops',8,8,'Centered 3 inches below the back neck seam to the upper edge of the design.'),
  ('back',14,'Full Back - Youth','Tops',10,10,'Centered 3 inches below the back neck seam to the upper edge of the design.'),
  ('back',59,'Hoodie Name Drop','Tops',12,2,'Centered 8 inches down from the hood seam to the upper edge of the design.'),
  ('back',107,'Left Back Shoulder','Tops',4,4,'7.5 inches down from the neck-and-shoulder seam intersection to the center of the design on the wearer''s left back shoulder.'),
  ('back',70,'Lower Back','Tops',13,4,'Centered 2 inches up from the shirt hem to the bottom edge of the artwork.'),
  ('back',71,'Lower Back Left','Tops',4,4,'Three inches up from the shirt hem to the bottom edge of the design on the wearer''s left.'),
  ('back',72,'Lower Back Right','Tops',4,4,'Three inches up from the shirt hem to the bottom edge of the design on the wearer''s right.'),
  ('back',21,'Name Back','Tops',12,4,'Centered 2 inches below the back neck seam to the upper edge of the design.'),
  ('back',20,'Nape Of Neck (Yoke)','Tops',3,3,'Centered 2 inches below the back neck seam to the upper edge of the design.'),
  ('back',22,'Number Back','Tops',null,null,'Centered 7 inches below the back neck seam to the upper edge of the design.'),
  ('back',78,'On Collar','Tops',4,0.25,'Customer-specified placement; proof required.'),
  ('back',79,'On Hood','Tops',4,4,'Customer-specified placement; proof required.'),
  ('back',106,'Right Back Shoulder','Tops',4,4,'7.5 inches down from the neck-and-shoulder seam intersection to the center of the design on the wearer''s right back shoulder.'),
  ('back',89,'Upper Back','Tops',12,4,'Centered 3 inches below the back neck seam to the upper edge of the design.'),
  ('back',16,'Custom Back','Custom',null,null,'Custom instructions and proof are required.')
)
insert into public.design_location_definitions (
  provider_key, provider_location_id, definition_version, view_side, provider_name, customer_label,
  provider_category, width_in, height_in, dimension_mode, placement_instructions,
  proof_required, custom_instructions_required, source_kind, source_reference, source_retrieved_at, raw_source
)
select 'ss_fast', provider_id, '2026-10-13', side, name, name, category, width_in, height_in,
  case when category='Custom' then 'custom' when width_in is null or height_in is null then 'vector' else 'fixed' end,
  instructions, instructions ilike '%proof required%', category='Custom', 'authenticated_account_screenshot',
  'FAST Design Location Guide — Heart Crafted Apparel LLC account screenshots (Front 71 / Back 28)',
  '2026-10-13T13:18:00-04:00'::timestamptz,
  jsonb_build_object('captured_name',name,'captured_category',category,'captured_dimensions',case when width_in is null then 'Vector x Vector' else width_in||' x '||height_in||' inches' end)
from source
on conflict (provider_key,provider_location_id,definition_version) do update set
  view_side=excluded.view_side, provider_name=excluded.provider_name, customer_label=excluded.customer_label,
  provider_category=excluded.provider_category, width_in=excluded.width_in, height_in=excluded.height_in,
  dimension_mode=excluded.dimension_mode, placement_instructions=excluded.placement_instructions,
  proof_required=excluded.proof_required, custom_instructions_required=excluded.custom_instructions_required,
  source_reference=excluded.source_reference, source_retrieved_at=excluded.source_retrieved_at,
  raw_source=excluded.raw_source, verified=true, active=true, updated_at=now();

-- Customer-facing studio support. The full 99-row registry remains available
-- privately; only these tops/sleeves locations are offered in this rollout.
update public.design_location_definitions set studio_enabled=false, surface_key=null,
  applicable_garment_types='{}', applicable_audiences='{}', applicable_methods='{}'
where provider_key='ss_fast' and definition_version='2026-10-13';

update public.design_location_definitions set
  studio_enabled=true, customer_group='Chest', surface_key='front', anchor_key='upper_center',
  applicable_garment_types=array['t_shirts','crewnecks','pullover_hoodies'], applicable_audiences=array['adult','youth'],
  applicable_methods=array['dtf','soft_vinyl','puff_vinyl','glitter_vinyl','flock_vinyl','embroidery','dtg']
where provider_location_id in (36,46) and definition_version='2026-10-13';

update public.design_location_definitions set
  studio_enabled=true, customer_group='Chest', surface_key='left_chest', anchor_key='wearer_left_chest',
  applicable_garment_types=array['t_shirts','crewnecks','pullover_hoodies','zip_hoodies'], applicable_audiences=array['adult','youth'],
  applicable_methods=array['dtf','soft_vinyl','puff_vinyl','glitter_vinyl','flock_vinyl','embroidery','dtg']
where provider_location_id in (47,65,2,80) and definition_version='2026-10-13';

update public.design_location_definitions set
  studio_enabled=true, customer_group='Chest', surface_key='right_chest', anchor_key='wearer_right_chest',
  applicable_garment_types=array['t_shirts','crewnecks','pullover_hoodies','zip_hoodies'], applicable_audiences=array['adult','youth'],
  applicable_methods=array['dtf','soft_vinyl','puff_vinyl','glitter_vinyl','flock_vinyl','embroidery','dtg']
where provider_location_id in (48,85,3,81) and definition_version='2026-10-13';

update public.design_location_definitions set
  studio_enabled=true, customer_group='Front', surface_key='front', anchor_key=case
    when provider_location_id in (69) then 'lower_center' when provider_location_id in (73) then 'lower_left'
    when provider_location_id in (32) then 'lower_right' else 'center_front' end,
  applicable_garment_types=array['t_shirts','crewnecks'], applicable_audiences=case
    when provider_location_id=13 then array['youth'] else array['adult'] end,
  applicable_methods=array['dtf','soft_vinyl','puff_vinyl','glitter_vinyl','flock_vinyl','dtg']
where provider_location_id in (4,13,49,50,69,73,32,55) and definition_version='2026-10-13';

update public.design_location_definitions set
  studio_enabled=true, customer_group='Front', surface_key='front', anchor_key=case when provider_location_id=60 then 'pocket_center' else 'center_front' end,
  applicable_garment_types=array['pullover_hoodies'], applicable_audiences=array['adult','youth'],
  applicable_methods=array['dtf','soft_vinyl','puff_vinyl','glitter_vinyl','flock_vinyl','dtg']
where provider_location_id in (58,60) and definition_version='2026-10-13';

update public.design_location_definitions set
  studio_enabled=true, customer_group='Sleeves', surface_key='left_sleeve', anchor_key=case when provider_location_id=105 then 'cuff' else 'sleeve' end,
  applicable_garment_types=array['t_shirts','crewnecks','pullover_hoodies','zip_hoodies'], applicable_audiences=array['adult','youth'],
  applicable_methods=array['dtf','soft_vinyl','puff_vinyl','glitter_vinyl','flock_vinyl','embroidery','dtg']
where provider_location_id in (52,30,105) and definition_version='2026-10-13';

update public.design_location_definitions set
  studio_enabled=true, customer_group='Sleeves', surface_key='right_sleeve', anchor_key=case when provider_location_id=104 then 'cuff' else 'sleeve' end,
  applicable_garment_types=array['t_shirts','crewnecks','pullover_hoodies','zip_hoodies'], applicable_audiences=array['adult','youth'],
  applicable_methods=array['dtf','soft_vinyl','puff_vinyl','glitter_vinyl','flock_vinyl','embroidery','dtg']
where provider_location_id in (54,31,104) and definition_version='2026-10-13';

update public.design_location_definitions set
  studio_enabled=true, customer_group='Back', surface_key='back', anchor_key=case
    when provider_location_id in (77,21,20,89) then 'upper_back'
    when provider_location_id in (70) then 'lower_center'
    when provider_location_id in (71,107,115) then 'back_left'
    when provider_location_id in (72,106,114) then 'back_right'
    when provider_location_id=59 then 'hood_name_drop'
    when provider_location_id=79 then 'hood' else 'center_back' end,
  applicable_garment_types=case when provider_location_id in (59,79) then array['pullover_hoodies','zip_hoodies'] else array['t_shirts','crewnecks','pullover_hoodies','zip_hoodies'] end,
  applicable_audiences=case when provider_location_id=14 then array['youth'] else array['adult','youth'] end,
  applicable_methods=array['dtf','soft_vinyl','puff_vinyl','glitter_vinyl','flock_vinyl','embroidery','dtg']
where provider_location_id in (77,115,114,19,14,59,107,70,71,72,21,20,22,78,79,106,89) and definition_version='2026-10-13';

update public.design_location_definitions set
  studio_enabled=true, customer_group='Other', surface_key=case when view_side='back' then 'back' else 'front' end,
  anchor_key=case when view_side='back' then 'center_back' else 'center_front' end,
  applicable_garment_types=array['t_shirts','crewnecks','pullover_hoodies','zip_hoodies'], applicable_audiences=array['adult','youth'],
  applicable_methods=array['dtf','soft_vinyl','puff_vinyl','glitter_vinyl','flock_vinyl','embroidery','dtg']
where provider_location_id in (15,16) and definition_version='2026-10-13';

update public.design_location_definitions set customer_label=case provider_location_id
  when 4 then 'Full Front' when 13 then 'Full Front — Youth'
  when 19 then 'Full Back' when 14 then 'Full Back — Youth'
  when 2 then 'Wearer''s Left Chest' when 3 then 'Wearer''s Right Chest'
  when 65 then 'Upper Left Chest' when 85 then 'Upper Right Chest'
  when 80 then 'Left Pocket' when 81 then 'Right Pocket'
  when 58 then 'Hoodie Full Front' when 60 then 'Hoodie Pocket'
  when 20 then 'Back Neck' when 21 then 'Back Name' when 22 then 'Back Number'
  when 30 then 'Wearer''s Left Sleeve' when 31 then 'Wearer''s Right Sleeve'
  when 52 then 'Down Wearer''s Left Sleeve' when 54 then 'Down Wearer''s Right Sleeve'
  when 105 then 'Wearer''s Left Cuff' when 104 then 'Wearer''s Right Cuff'
  when 15 then 'Custom Placement — Front' when 16 then 'Custom Placement — Back'
  else customer_label end
where studio_enabled and definition_version='2026-10-13';

create or replace view public.storefront_design_locations with (security_invoker=true) as
select id, definition_version, view_side, customer_label, customer_group, surface_key,
  width_in, height_in, dimension_mode, units, anchor_key, placement_instructions,
  proof_required, custom_instructions_required, applicable_garment_types,
  applicable_audiences, applicable_methods, verified
from public.design_location_definitions
where active and verified and studio_enabled;

revoke all on public.storefront_design_locations from anon, authenticated;
grant select on public.storefront_design_locations to service_role;

alter table public.design_documents
  add column if not exists placement_definition_version text,
  add column if not exists legacy_placement_review_required boolean not null default false;

create table if not exists public.design_document_locations (
  design_id uuid not null references public.design_documents(id) on delete cascade,
  surface_key text not null,
  location_definition_id uuid not null references public.design_location_definitions(id) on delete restrict,
  definition_version text not null,
  intended_width_in numeric(8,3),
  intended_height_in numeric(8,3),
  x_percent numeric(8,4),
  y_percent numeric(8,4),
  rotation_degrees numeric(8,3) not null default 0,
  custom_instructions text,
  proof_approved_at timestamptz,
  proof_approved_by uuid references auth.users(id),
  saved_at timestamptz not null default now(),
  primary key (design_id, surface_key)
);
alter table public.design_document_locations enable row level security;
drop policy if exists design_document_locations_owner_read on public.design_document_locations;
create policy design_document_locations_owner_read on public.design_document_locations for select to authenticated
using (exists(select 1 from public.design_documents d where d.id=design_id and (d.owner_user_id=auth.uid() or public.is_admin())));
grant select, insert, update on public.design_document_locations to service_role;
grant select on public.design_document_locations to authenticated;

update public.design_documents
set legacy_placement_review_required=true
where coalesce((document->>'schemaVersion')::integer,1) < 2
  and jsonb_typeof(document->'placements')='object'
  and exists (select 1 from jsonb_each(document->'placements') p where jsonb_typeof(p.value)='array' and jsonb_array_length(p.value) > 0);

comment on table public.design_location_definitions is 'Private, versioned placement source registry. Never expose provider IDs or source evidence in storefront responses.';
comment on view public.storefront_design_locations is 'Customer-safe Design Studio placement metadata; supplier identity and numeric location IDs are intentionally omitted.';
