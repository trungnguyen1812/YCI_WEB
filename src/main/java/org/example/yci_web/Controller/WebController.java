package org.example.yci_web.Controller;

import jakarta.servlet.http.HttpSession;
import org.example.yci_web.Model.DTO.LoginDTO;
import org.example.yci_web.Model.DTO.UserDTO;
import org.example.yci_web.Model.Request.RegisterRequest;
import org.example.yci_web.Model.Request.UpdateProfileRequest;
import org.example.yci_web.Model.Response.DataResponse;
import org.example.yci_web.Model.Response.MessageResponse;
import org.example.yci_web.Service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class WebController {
    private static final String SESSION_USER = "currentUser";
    private static final int ROLE_ADMIN = 0;
    private static final int ROLE_STAFF = 2;

    @Autowired
    UserService userService;

    @ModelAttribute("currentUser")
    public UserDTO currentUser(HttpSession session) {
        Object user = session.getAttribute(SESSION_USER);
        return user instanceof UserDTO ? (UserDTO) user : null;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("pageTitle", "Trang chủ");
        model.addAttribute("pageName", "home");
        return "pages/public/home";
    }

    @GetMapping("/products")
    public String products(Model model) {
        model.addAttribute("pageTitle", "Thiết bị cho thuê");
        model.addAttribute("pageName", "catalog");
        return "pages/public/catalog";
    }

    @GetMapping("/products/{id}")
    public String productDetail(@PathVariable Long id, Model model) {
        model.addAttribute("pageTitle", "Chi tiết thiết bị");
        model.addAttribute("pageName", "product-detail");
        model.addAttribute("productId", id);
        return "pages/public/product-detail";
    }

    @GetMapping("/pricing")
    public String pricing(Model model) {
        model.addAttribute("pageTitle", "Bảng giá");
        model.addAttribute("pageName", "pricing");
        return "pages/public/pricing";
    }

    @GetMapping("/regulations")
    public String regulations(Model model) {
        model.addAttribute("pageTitle", "Quy định thuê");
        model.addAttribute("pageName", "regulations");
        return "pages/public/regulations";
    }

    @GetMapping("/complete-profile")
    public String completeProfile(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        if (session.getAttribute(SESSION_USER) == null) {
            return "redirect:/login";
        }
        Object user = session.getAttribute(SESSION_USER);
        if (user instanceof UserDTO userDTO && userDTO.getPhone() != null && !userDTO.getPhone().isBlank()) {
            // Phone already set — no need to complete
            return "redirect:/profile";
        }
        model.addAttribute("pageTitle", "Hoàn tất hồ sơ");
        model.addAttribute("pageName", "complete-profile");
        return "pages/auth/complete-profile";
    }

    @PostMapping("/complete-profile")
    public String doCompleteProfile(@ModelAttribute UpdateProfileRequest updateProfileRequest,
                                    HttpSession session,
                                    RedirectAttributes redirectAttributes) {
        if (session.getAttribute(SESSION_USER) == null) {
            return "redirect:/login";
        }
        MessageResponse response = userService.updateProfile(updateProfileRequest);
        if (HttpStatus.OK.equals(response.getStatus())) {
            // Refresh session với data mới
            Object userResult = userService.getUserById(updateProfileRequest.getIdUser());
            if (userResult instanceof DataResponse<?> userResponse && userResponse.getData() instanceof UserDTO userDTO) {
                session.setAttribute(SESSION_USER, userDTO);
            }
            redirectAttributes.addFlashAttribute("success", "Hồ sơ đã hoàn tất. Bạn có thể đặt thuê ngay!");
            return "redirect:/profile";
        }
        redirectAttributes.addFlashAttribute("error", response.getMessage());
        return "redirect:/complete-profile";
    }

    @GetMapping("/booking")
    public String booking(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        Object user = session.getAttribute(SESSION_USER);
        if (user == null) {
            redirectAttributes.addFlashAttribute("error", "Vui lòng đăng nhập để đặt lịch thuê.");
            return "redirect:/login";
        }
        if (user instanceof UserDTO userDTO && isAdminRole(userDTO)) {
            redirectAttributes.addFlashAttribute("error", "Tài khoản quản trị chỉ được xem, không thể đặt thuê.");
            return "redirect:/admin";
        }
        // Kiểm tra hồ sơ đầy đủ (bắt buộc SĐT)
        if (user instanceof UserDTO userDTO) {
            if (userDTO.getPhone() == null || userDTO.getPhone().isBlank()) {
                redirectAttributes.addFlashAttribute("error", "Vui lòng bổ sung số điện thoại để có thể đặt thuê.");
                return "redirect:/complete-profile";
            }
        }
        model.addAttribute("pageTitle", "Đặt lịch thuê");
        model.addAttribute("pageName", "booking");
        return "pages/customer/booking";
    }

    @GetMapping("/profile")
    public String profile(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        if (session.getAttribute(SESSION_USER) == null) {
            redirectAttributes.addFlashAttribute("error", "Vui lòng đăng nhập để quản lý tài khoản.");
            return "redirect:/login";
        }
        model.addAttribute("pageTitle", "Tài khoản");
        model.addAttribute("pageName", "profile");
        return "pages/customer/profile";
    }

    @PostMapping("/profile")
    public String doProfile(@ModelAttribute UpdateProfileRequest updateProfileRequest,
                            HttpSession session,
                            RedirectAttributes redirectAttributes) {
        if (session.getAttribute(SESSION_USER) == null) {
            redirectAttributes.addFlashAttribute("error", "Vui lòng đăng nhập để quản lý tài khoản.");
            return "redirect:/login";
        }
        MessageResponse response = userService.updateProfile(updateProfileRequest);
        if (HttpStatus.OK.equals(response.getStatus())) {
            Object userResult = userService.getUserById(updateProfileRequest.getIdUser());
            if (userResult instanceof DataResponse<?> userResponse && userResponse.getData() instanceof UserDTO userDTO) {
                session.setAttribute(SESSION_USER, userDTO);
            }
            redirectAttributes.addFlashAttribute("success", "Đã cập nhật hồ sơ.");
        } else {
            redirectAttributes.addFlashAttribute("error", response.getMessage());
        }
        return "redirect:/profile";
    }

    @GetMapping("/orders")
    public String orders(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        if (session.getAttribute(SESSION_USER) == null) {
            redirectAttributes.addFlashAttribute("error", "Vui lòng đăng nhập để xem lịch sử thuê.");
            return "redirect:/login";
        }
        model.addAttribute("pageTitle", "Đơn thuê của tôi");
        model.addAttribute("pageName", "orders");
        return "pages/customer/orders";
    }

    @GetMapping("/login")
    public String login(Model model) {
        model.addAttribute("pageTitle", "Đăng nhập");
        model.addAttribute("pageName", "login");
        return "pages/auth/login";
    }

    @PostMapping("/login")
    public String doLogin(@RequestParam String email,
                          @RequestParam String password,
                          HttpSession session,
                          RedirectAttributes redirectAttributes) {
        Object result = userService.login(email, password);
        if (result instanceof DataResponse<?> dataResponse && dataResponse.getData() instanceof LoginDTO loginDTO) {
            Object userResult = userService.getUserById(loginDTO.getIdUser());
            if (userResult instanceof DataResponse<?> userResponse && userResponse.getData() instanceof UserDTO userDTO) {
                session.setAttribute(SESSION_USER, userDTO);
                redirectAttributes.addFlashAttribute("success", "Đăng nhập thành công.");
                if (isAdminRole(userDTO)) {
                    return "redirect:/admin";
                }
                if (isStaffRole(userDTO)) {
                    return "redirect:/staff";
                }
                return "redirect:/profile";
            }
        }
        redirectAttributes.addFlashAttribute("error", "Email hoặc mật khẩu không đúng.");
        return "redirect:/login";
    }

    @GetMapping("/register")
    public String register(Model model) {
        model.addAttribute("pageTitle", "Đăng ký");
        model.addAttribute("pageName", "register");
        model.addAttribute("registerRequest", new RegisterRequest());
        return "pages/auth/register";
    }

    @PostMapping("/register")
    public String doRegister(@ModelAttribute RegisterRequest registerRequest,
                             Model model,
                             RedirectAttributes redirectAttributes) {
        MessageResponse response = userService.register(registerRequest);
        if (HttpStatus.CREATED.equals(response.getStatus())) {
            redirectAttributes.addFlashAttribute("success", "Đăng ký thành công. Hãy đăng nhập để bắt đầu đặt thuê.");
            return "redirect:/login";
        }
        // Lỗi → giữ lại form, không redirect
        model.addAttribute("error", response.getMessage());
        model.addAttribute("registerRequest", registerRequest);
        model.addAttribute("pageTitle", "Đăng ký");
        model.addAttribute("pageName", "register");
        return "pages/auth/register";
    }

    @PostMapping("/logout")
    public String logout(HttpSession session, RedirectAttributes redirectAttributes) {
        session.invalidate();
        redirectAttributes.addFlashAttribute("success", "Đã đăng xuất.");
        return "redirect:/";
    }

    @GetMapping("/staff")
    public String staff(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        Object user = session.getAttribute(SESSION_USER);
        if (user instanceof UserDTO userDTO && isAdminRole(userDTO)) {
            redirectAttributes.addFlashAttribute("error", "Quản trị viên chỉ xem đơn thuê tại màn quản trị.");
            return "redirect:/admin/bookings";
        }
        if (!hasStaffAccess(session)) {
            redirectAttributes.addFlashAttribute("error", "Tài khoản hiện tại không có quyền nhân viên.");
            return "redirect:/profile";
        }
        model.addAttribute("pageTitle", "Xử lý đơn thuê");
        model.addAttribute("pageName", "staff-bookings");
        return "pages/staff/bookings";
    }

    @GetMapping("/admin")
    public String admin(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        if (!hasAdminAccess(session)) {
            redirectAttributes.addFlashAttribute("error", "Tài khoản hiện tại không có quyền quản trị.");
            return "redirect:/profile";
        }
        model.addAttribute("pageTitle", "Tổng quan quản trị");
        model.addAttribute("pageName", "admin-dashboard");
        return "pages/admin/dashboard";
    }

    @GetMapping("/admin/products")
    public String adminProducts(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        if (!hasAdminAccess(session)) {
            redirectAttributes.addFlashAttribute("error", "Tài khoản hiện tại không có quyền quản trị.");
            return "redirect:/profile";
        }
        model.addAttribute("pageTitle", "Quản lý thiết bị");
        model.addAttribute("pageName", "admin-products");
        return "pages/admin/products";
    }

    @GetMapping("/admin/bookings")
    public String adminBookings(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        if (!hasAdminAccess(session)) {
            redirectAttributes.addFlashAttribute("error", "Tài khoản hiện tại không có quyền quản trị.");
            return "redirect:/profile";
        }
        model.addAttribute("pageTitle", "Quản lý đơn thuê");
        model.addAttribute("pageName", "admin-bookings");
        return "pages/admin/bookings";
    }

    @GetMapping("/admin/customers")
    public String adminCustomers(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        if (!hasAdminAccess(session)) {
            redirectAttributes.addFlashAttribute("error", "Tài khoản hiện tại không có quyền quản trị.");
            return "redirect:/profile";
        }
        model.addAttribute("pageTitle", "Khách hàng");
        model.addAttribute("pageName", "admin-customers");
        return "pages/admin/customers";
    }

    @GetMapping("/admin/finance")
    public String adminFinance(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        if (!hasAdminAccess(session)) {
            redirectAttributes.addFlashAttribute("error", "Tài khoản hiện tại không có quyền quản trị.");
            return "redirect:/profile";
        }
        model.addAttribute("pageTitle", "Doanh thu");
        model.addAttribute("pageName", "admin-finance");
        return "pages/admin/finance";
    }

    @GetMapping("/admin/settings")
    public String adminSettings(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        if (!hasAdminAccess(session)) {
            redirectAttributes.addFlashAttribute("error", "Tài khoản hiện tại không có quyền quản trị.");
            return "redirect:/profile";
        }
        model.addAttribute("pageTitle", "Cấu hình nghiệp vụ");
        model.addAttribute("pageName", "admin-settings");
        return "pages/admin/settings";
    }

    @GetMapping("/admin/refunds")
    public String adminRefunds(HttpSession session, RedirectAttributes redirectAttributes, Model model) {
        if (!hasAdminAccess(session)) {
            redirectAttributes.addFlashAttribute("error", "Tài khoản hiện tại không có quyền quản trị.");
            return "redirect:/profile";
        }
        model.addAttribute("pageTitle", "Hủy đơn & Hoàn tiền");
        model.addAttribute("pageName", "admin-refunds");
        return "pages/admin/refunds";
    }

    private boolean hasStaffAccess(HttpSession session) {
        Object user = session.getAttribute(SESSION_USER);
        if (!(user instanceof UserDTO userDTO) || userDTO.getRole() == null) {
            return false;
        }
        return isStaffRole(userDTO);
    }

    private boolean hasAdminAccess(HttpSession session) {
        Object user = session.getAttribute(SESSION_USER);
        if (!(user instanceof UserDTO userDTO) || userDTO.getRole() == null) {
            return false;
        }
        return isAdminRole(userDTO);
    }

    private boolean isAdminRole(UserDTO userDTO) {
        return userDTO != null && userDTO.getRole() != null && userDTO.getRole() == ROLE_ADMIN;
    }

    private boolean isStaffRole(UserDTO userDTO) {
        return userDTO != null && userDTO.getRole() != null && userDTO.getRole() == ROLE_STAFF;
    }
}
