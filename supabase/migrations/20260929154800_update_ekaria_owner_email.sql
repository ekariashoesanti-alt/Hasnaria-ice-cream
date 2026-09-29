update public.account_access_registry
set email = 'ekariashoesanti@gmail.com',
    auth_user_id = null,
    status = 'pending_activation',
    updated_at = now()
where lower(email) = 'ekariashoesanti@yahoo.com'
  and full_name = 'Ekaria Shoesanti'
  and access_role = 'owner';
