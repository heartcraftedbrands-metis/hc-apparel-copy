do $$
declare
  v_rows integer;
  v_admin_note constant text := 'Hidden from public shop due to high retail price.';
begin
  update public.products
  set
    is_active = false,
    visibility = 'hidden',
    internal_notes = case
      when position(v_admin_note in coalesce(internal_notes, '')) > 0 then internal_notes
      when btrim(coalesce(internal_notes, '')) = '' then v_admin_note
      else internal_notes || E'\n' || v_admin_note
    end,
    updated_date = now()
  where id = '90ec2432-b1b2-4b5a-bf27-d0169bcc428c'
    and lower(btrim(name)) = 'adidas a2013'
    and price between 90 and 95;

  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    raise exception
      'Expected to hide exactly one adidas A2013 product, but updated % rows.',
      v_rows;
  end if;
end
$$;
