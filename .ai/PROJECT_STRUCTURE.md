# Project Structure

```
src/

app/

core/

guards/

interceptors/

services/

models/

utils/

shared/

components/

pipes/

directives/

validators/

layouts/

public-layout/

dashboard-layout/

auth-layout/

features/

public/

home/

about/

services/

blog/

contact/

tools/

data/

auth/

login/

verify-otp/

forgot-password/

dashboard/

dashboard-home/

profile/

settings/

subscription/

assets/

images/

icons/

fonts/

scss/

environment/
```

---

## Rules

Core contains singleton services.

Shared contains reusable UI.

Features contain business modules.

Layouts contain application layouts.

Never mix responsibilities.

Never place API logic inside components.

Never place reusable components inside feature folders.